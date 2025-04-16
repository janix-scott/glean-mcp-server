Get Started
Authentication
The developer-ready Client API endpoints can be accessed via one of two types of Bearer tokens: OAuth Access Tokens issued by an SSO provider or Glean-issued tokens. Both methods can be used concurrently, but we recommend using OAuth access tokens for a more secure authentication for Client API requests, scoped to the individual user it’s issued to.

​
Navigating to Client API Settings
Only admins have access to these settings. To access it, navigate to this link, or do the following:

Click on the wrench icon in the left navigation bar. This will open up the admin console.
On the left sidebar, navigate to Platform and select API Tokens.
In the API Tokens page, select the Client Tokens tab. Here you can see a list of all token metadata (note that the token itself won’t be visible).
​
OAuth Access Tokens
​
Setup
Admins can enable this feature in Glean’s Client API Settings. To enable use of OAuth access tokens with our Rest APIs, click on the toggle labeled “Allow OAuth token-based access.” You will need to provide the following:

1
Select your OAuth provider

Choose from supported providers: Azure, GSuite, Okta, or OneLogin

2
Specify the issuer subdomain

Required if your provider is not GSuite. This value can be found on the payload of your JWT access tokens, and should have one of the following formats:

https://login.microsoftonline.com/<directory_ID>/v2.0 for Azure
https://<subdomain>.okta.com for Okta
https://<subdomain>.onelogin.com/oidc/2 for OneLogin
3
Enter Client IDs

Provide a comma-separated list of Client IDs of the applications for which your access tokens will be issued.

Once saved, your settings may need up to 10 minutes to take effect.

​
Using access tokens
To use an OAuth access token to authenticate against the Rest API, set the following HTTP headers:

Authorization: Bearer <access_token>
X-Glean-Auth-Type: OAUTH
Note that OAuth access tokens are treated as user-permissioned tokens with access to all of the scopes listed below.

If using GSuite access tokens, please ensure that your tokens are granted the following scopes:

openid
email
profile
​
Glean-Issued Tokens
You can create tokens in Glean’s Client API Settings. This option is only accessible to admins. To access it:

Client API Token UI
Click on the wrench icon in the left navigation bar. This will open up the admin console.
On the left sidebar, navigate to Setup and select API Tokens.
In the API Tokens page, select the Client Tokens tab. Here you can see a list of all token metadata (note that the token itself won’t be visible).
To create a new token, click Add New Token. In the dialogue box, fill in appropriate values for Description, Permissions, Scopes, and Expires fields, then click Save.
The newly created token secret will only be visible once after its creation. Please ensure you save it securely as you won’t be able to retrieve it later.

​
Selecting Permissions and Scopes
Each token should have one associated permission and one or more scopes to be usable.

The permissions and scopes assigned to a token cannot be changed after the token is created. Carefully select these attributes during token creation.

​
Permissions
Permissions define the ability of the token to act on behalf of a user. The available options are:

​
GLOBAL
These tokens can make API calls on behalf of any user in the system. To identify the user for each API call, the X-Scio-ActAs HTTP header must be included, specifying the user’s email address.

Tokens with GLOBAL permissions can only be created by Super Admin users.

​
USER
These tokens can make API calls on behalf of a particular user. The user email is fixed while creating the token. The X-Scio-ActAs HTTP header must be empty.

​
ANONYMOUS
These tokens can make API calls on behalf of an anonymous user. The X-Scio-ActAs HTTP header must be empty.

ANONYMOUS permissions are supported only for a few endpoints as of now. Please contact Glean support if you’re interested to use such tokens.

​
Scopes
Scopes define the endpoints that are available to a token. A client API token can have one or more of the following scopes:

Scope	Description
ACTIVITY	Can access datasource user activity collection endpoints.
ANNOUNCEMENTS	Can access Glean Announcements related endpoints.
ANSWERS	Can access Glean Answers related endpoints.
CHAT	Can access GleanChat related endpoints.
COLLECTIONS	Can access Glean Collections related endpoints.
DOCPERMISSIONS	Can access the Glean Document Permissions related endpoints.
DOCUMENTS	Can access endpoints related to Glean documents.
ENTITIES	Can access endpoints related to entities.
FEED	Can access Glean Feed related endpoints.
FEEDBACK	Can access user feedback related endpoints.
INSIGHTS	Can access insights related endpoints.
PEOPLE	Can access Glean people related endpoints.
PINS	Can access Glean pins related endpoints.
SEARCH	Can access endpoints related to search queries and autocomplete.
SHORTCUTS	Can access shortcuts feature (aka GoLinks) related endpoints.
SUMMARIZE	Can access AI summary related endpoints.
VERIFICATION	Can access endpoints related to document verification feature.