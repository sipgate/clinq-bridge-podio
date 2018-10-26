import { Adapter, Config, Contact, start } from "@clinq/bridge";
import axios from "axios";
import { Request } from "express";
import * as qs from "querystring";
import parseEnvironment from "./parse-environment";
import { PodioContact } from "./podio-contact.model";

const { clientId, clientSecret, redirectUrl } = parseEnvironment();

const API_URL_TOKEN = "https://podio.com/oauth/token";
const API_URL_CONTACT = "https://api.podio.com/contact";
const API_URL_AUTHORIZE = "https://podio.com/oauth/authorize";

const convertContact = (contact: PodioContact): Contact => ({
  id: String(contact.profile_id),
  name: contact.name,
  email:
    Array.isArray(contact.mail) && contact.mail[0] ? contact.mail[0] : null,
  company: null,
  contactUrl: contact.link,
  avatarUrl: null,
  phoneNumbers: contact.phone.map(phoneNumber => ({
    label: null,
    phoneNumber
  }))
});

class PodioAdapter implements Adapter {
  public async getContacts(config: Config): Promise<Contact[]> {
    const { apiKey } = config;
    const [, refreshToken] = apiKey.split(":");
    const query = qs.stringify({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken
    });
    const authResponse = await axios.post(API_URL_TOKEN, query);
    const { access_token: accessToken } = authResponse.data;
    const contactsResponse = await axios.get<PodioContact[]>(API_URL_CONTACT, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    return contactsResponse.data.map(convertContact);
  }

  public async getOAuth2RedirectUrl() {
    const query = qs.stringify({
      client_id: clientId,
      redirect_uri: redirectUrl,
      // TODO: Contacts scope
      scope: "global:all"
    });
    return `${API_URL_AUTHORIZE}?${query}`;
  }

  public async handleOAuth2Callback(request: Request): Promise<Config> {
    const { code } = request.query;
    const query = qs.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirectUrl,
      client_secret: clientSecret,
      code
    });
    console.log(query);
    const response = await axios.post(API_URL_TOKEN, query);
    const { access_token, refresh_token } = response.data;
    console.log(response.data);
    return {
      apiKey: `${access_token}:${refresh_token}`,
      apiUrl: ""
    };
  }
}

start(new PodioAdapter());
