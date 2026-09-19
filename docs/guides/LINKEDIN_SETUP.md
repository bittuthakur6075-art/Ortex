# LinkedIn: connecting the Company Page

Posts from the console's **Social** page can go to the Ortex **LinkedIn Company
Page** as well as Instagram and Facebook. This is the one-time setup.

LinkedIn only lets an app post to a Company Page after it approves the app for
its **Community Management API**, a vetted product. Your part takes about 20
minutes; LinkedIn's review can take from a few days to a few weeks, so start it
early. Everything in the console is already built and waits for the approval.

## 1. The Company Page

On linkedin.com (with your personal account): **For Business → Create a Company
Page → Company**. Name "Ortex Industries", website
`https://bizgift.ortexindustries.in`, industry, size, logo. Create.

Open the page as admin. The address is
`linkedin.com/company/<number>/admin/`; that number is the page's
**organisation ID** (needed only if you run more than one Company Page).

## 2. The developer app

1. **developer.linkedin.com → My apps → Create app**
   - App name: `Ortex Publisher`
   - LinkedIn Page: **Ortex Industries**
   - Privacy policy URL: `https://bizgift.ortexindustries.in/privacy`
   - App logo: the Ortex logo
2. **Settings** tab → **Verify** next to the Company Page. Open the link it gives
   you while signed in as a page admin, and approve.
3. **Auth** tab → **Authorized redirect URLs for your app → Add**, exactly:

   ```
   https://pfoeztiakqtemakfgpgs.supabase.co/functions/v1/social-accounts
   ```

4. **Products** tab → **Community Management API → Request access**
   (Development tier). It must be a new app with **no other products** on it,
   or the option is greyed out. The form asks for the legal business name,
   business email and address, and the use case. Describe it plainly, e.g.
   *"Publishing our own company's marketing posts to our own LinkedIn Page from
   our internal admin console. One page, a few posts a week, always approved by a
   person first."*

The Development tier allows 500 calls a day per app, far more than daily posts
use. Standard tier is not needed.

## 3. After LinkedIn approves

From the app's **Auth** tab copy the **Client ID** and **Client Secret**, then
from `Ortex.Admin/`:

```bash
supabase secrets set LINKEDIN_CLIENT_ID=<client-id> LINKEDIN_CLIENT_SECRET=<client-secret> --project-ref pfoeztiakqtemakfgpgs
# only if the signing-in admin runs more than one Company Page:
supabase secrets set LINKEDIN_ORG_ID=<organisation number> --project-ref pfoeztiakqtemakfgpgs
```

Then on the console's **Social** page an admin clicks **Connect LinkedIn**,
signs in to LinkedIn with an account that is an **admin of the Company Page**,
and allows the app. The page returns with "LinkedIn connected", and **LinkedIn
Page** can be ticked on any post.

## How the connection lasts

- LinkedIn access tokens last 60 days. The scheduled sweep renews them
  automatically once fewer than 10 days are left.
- Renewal works for **one year from the sign-in** (LinkedIn's refresh token does
  not extend itself). The Social page shows the date and turns amber 30 days
  before; an admin then clicks **Reconnect LinkedIn** once.
- Tokens are stored in `social_connections` (migration 0037), which has no access
  policy: no browser session can read them, only the `social-accounts` and
  `social-publish` functions. **Disconnect** on the Social page deletes them.

## What gets posted

One image post on the Company Page: the creative, the caption, and the hashtags
as real LinkedIn hashtags. LinkedIn reserves `| { } @ [ ] ( ) < > # \ * _ ~` in
post text; they are escaped automatically, so a caption reads on LinkedIn exactly
as written. The limit is 3,000 characters.

## Deploy (for whoever maintains the functions)

```bash
supabase functions deploy social-accounts --no-verify-jwt   # LinkedIn's redirect carries no Supabase session
supabase functions deploy social-publish
```

Optional secrets: `LINKEDIN_API_VERSION` (`YYYYMM`, default `202608`; each
version is supported about a year), `LINKEDIN_SCOPES` (default
`w_organization_social r_organization_social rw_organization_admin`).

## When something goes wrong

| Message | Meaning |
|---|---|
| "not an admin of the Ortex Company Page" | Sign in with a LinkedIn account that is a page **admin** (Page → Admin tools → Manage admins). |
| "runs several Company Pages" | Set `LINKEDIN_ORG_ID` (step 3). |
| "LinkedIn denied … Community Management API" | The app is not approved yet, or the product was added to an app that also has other products. |
| `redirect_uri` error on LinkedIn's screen | The redirect URL in step 2.3 is missing or has a typo. |
| "The LinkedIn connection has expired" | The yearly sign-in ran out: click **Connect LinkedIn** again. |
