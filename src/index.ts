import {
  Adapter,
  Config,
  Contact,
  PhoneNumberLabel,
  start
} from "@clinq/bridge";
import axios from "axios";
import { Request } from "express";
import * as qs from "querystring";
import parseEnvironment from "./parse-environment";
import { PodioContact } from "./podio-contact.model";

const { clientId, clientSecret, redirectUrl } = parseEnvironment();

const API_URL_TOKEN = "https://podio.com/oauth/token";
const API_URL_CONTACT = "https://api.podio.com/contact";
const API_URL_AUTHORIZE = "https://podio.com/oauth/authorize";

const hasValue = (field: string[] | undefined): boolean =>
  Array.isArray(field) && field.length > 0;

const convertContact = (contact: PodioContact): Contact => ({
  id: String(contact.profile_id),
  name: contact.name,
  firstName: null,
  lastName: null,
  email: hasValue(contact.mail) ? contact.mail[0] : null,
  organization: null,
  contactUrl: contact.link,
  avatarUrl: null,
  phoneNumbers: contact.phone.map(phoneNumber => ({
    label: PhoneNumberLabel.WORK,
    phoneNumber
  }))
});

const getAccessToken = async (refreshToken: string) => {
  const query = qs.stringify({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
  });
  const response = await axios.post(API_URL_TOKEN, query);
  const { access_token: accessToken } = response.data;
  return accessToken;
};

const getContacts = async (accessToken: string) => {
  const contactResponse = await axios.get<PodioContact[]>(API_URL_CONTACT, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!Array.isArray(contactResponse.data)) {
    return [];
  }

  const contacts = contactResponse.data
    .filter(entry => hasValue(entry.phone))
    .map(contact => convertContact(contact));
  return contacts;
};

class PodioAdapter implements Adapter {
  public async getContacts(config: Config): Promise<Contact[]> {
    const { apiKey } = config;
    const [accessToken, refreshToken] = apiKey.split(":");
    try {
      return await getContacts(accessToken);
    } catch {
      const freshAccessToken = await getAccessToken(refreshToken);
      return await getContacts(freshAccessToken);
    }
  }

  public async getOAuth2RedirectUrl() {
    const query = qs.stringify({
      client_id: clientId,
      redirect_uri: redirectUrl
    });
    return `${API_URL_AUTHORIZE}?${query}`;
  }

  public async handleOAuth2Callback(
    request: Request
  ): Promise<{ apiKey: string; apiUrl: string }> {
    const { code } = request.query;
    const query = qs.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirectUrl,
      client_secret: clientSecret,
      code
    });
    const response = await axios.post(API_URL_TOKEN, query);
    const { access_token, refresh_token } = response.data;
    return {
      apiKey: `${access_token}:${refresh_token}`,
      apiUrl: ""
    };
  }
}

start(new PodioAdapter());
