# Privacy & Legal Checklist

Use this to stay secure and legally compliant for yvshmusic.com (presave, optional email, any future features).

---

## 1. Privacy policy (required)

**Why:** GDPR (EU/UK/EEA), CCPA (California), and general good practice require telling users what you collect and why.

**Include:**
- **What you collect:** Spotify user ID, Spotify refresh token (to save the track on release day), optional email (if they enter it on the success page), and standard server logs (IP, timestamp, user agent).
- **Why:** To add the track to their Spotify library on release day; to notify them if they gave email; to run and secure the site.
- **Who you share with:** Spotify (to complete the presave), Supabase (database), Vercel (hosting). You don’t sell data.
- **How long you keep it:** e.g. “Until the release is done and we’ve run the save, plus 90 days; or until you ask for deletion.”
- **Rights:** Right to access (copy of their data), right to deletion, how to contact you (link to contact page).
- **Age:** “You must be 13 or older (16 in the EEA/UK) to use the presave feature.”
- **Security:** Data in transit (HTTPS), stored in a locked-down database; no passwords or payment data.

**Where:** Dedicated `/privacy` page, linked in the footer (and anywhere you collect data, e.g. near the presave button or success page).

---

## 2. Age restriction (required)

**Why:**  
- **COPPA (US):** Under 13 – need verifiable parental consent or don’t collect.  
- **GDPR (EU/EEA/UK):** Consent for “information society services” is 16 in many countries (some allow 13–15). So “no one under 13 from Europe” is the minimum; in practice “16+ in EEA/UK, 13+ elsewhere” is a common, safe approach.

**What to do:**
- State in the privacy policy: “You must be at least 13 to use this site. In the European Economic Area and the UK you must be at least 16.”
- **Age gate:** Before they can complete the presave (or enter email), show a clear notice and require confirmation, e.g.  
  “I confirm I am at least 13 years old (16 in the EEA/UK).”  
  Checkbox or “I’m old enough” button; only then let them proceed to Spotify OAuth (and/or email).  
- You don’t need to verify age; you need to state the rule and get a clear affirmation so you’re not knowingly collecting from under-age users.

---

## 3. Contact page for data requests (required)

**Why:** GDPR and CCPA give people the right to request a copy of their data and to request deletion. You must tell them how to contact you (privacy policy) and actually respond.

**What to provide:**
- A **contact page** (e.g. `/contact`) or a clear contact method (email or form).
- On it (and in the privacy policy), say something like:  
  “For a copy of the data we hold about you, or to request deletion, contact us at [email/link].”
- **Process when someone contacts you:**  
  - **“Give me my data”:** Find them in Supabase (by email if they gave it, or ask them to tell you the email they used or to confirm they’re the person who presaved from [date/campaign]). Export the row(s) – you can send a summary (e.g. “Spotify user ID, campaign, date presaved”); avoid sending the raw refresh token by email; use a secure method or explain what you store without pasting the token.  
  - **“Delete my data”:** Find the same row(s) in `presaves`, delete them, confirm by email. After that you can’t add the track to their library on release day (which you can tell them).

**Implementation:**  
- Add a `/contact` page with your email (or a form that emails you).  
- Link “Privacy” and “Contact” in the footer of the main pages (home, presave success, etc.).

---

## 4. Other things to consider

| Item | Notes |
|------|--------|
| **Terms of use** | Short terms: age requirement, acceptable use, “we use your data to provide the presave service,” no warranty, governing law. Link in footer. |
| **Cookies** | You use minimal cookies (OAuth state, presave_id for email). If you add analytics (e.g. Google Analytics) or non-essential cookies, you’ll need a cookie notice and consent where required (e.g. GDPR). For now, a one-line in the privacy policy (“We use strictly necessary cookies to run the presave flow”) is enough. |
| **Data retention** | Define and state: e.g. “We keep presave data until [X time] after the release, or until you ask for deletion.” Then stick to it (delete old rows if you said you would). |
| **No sale of data** | You don’t sell data; say so in the privacy policy. CCPA “right to opt out of sale” is N/A but good to state. |
| **Subprocessors** | You use Supabase, Vercel, Spotify. Mention them in the privacy policy as “service providers who process data on our behalf.” You don’t need a separate “subprocessor list” page unless you want one. |
| **Breach** | Have a plan: if tokens or emails were exposed, notify affected users and, where required (e.g. GDPR), notify the regulator. Hope you never need it. |
| **Accessibility** | Policies and contact should be easy to find (footer links) and readable. |

---

## 5. Implementation order

1. **Privacy policy** – Write and publish at `/privacy`, link in footer.  
2. **Contact** – Add `/contact` with email or form, link in footer and in the privacy policy.  
3. **Age gate** – Add confirmation (“I am 13+ / 16+ in EEA/UK”) before presave (and before email if collected).  
4. **Terms** – Short terms at `/terms`, link in footer.  
5. **Footer** – Ensure every main layout/page has footer links: Privacy, Terms (optional but good), Contact.

---

## 6. Quick reference: what you store

| Data | Where | Purpose |
|------|--------|---------|
| Spotify user ID | Supabase `presaves` | Identify the user; one presave per person per campaign. |
| Refresh token | Supabase `presaves` | Add the track to their library on release day. |
| Email (optional) | Supabase `presaves` | Notify when the track drops (if you use it). |
| Server logs | Vercel / hosting | Security, debugging (IP, timestamp, etc.). |

You do **not** store: Spotify password, payment info, or anything beyond the above.
