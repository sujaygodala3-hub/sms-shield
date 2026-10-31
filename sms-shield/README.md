# SMS Shield

SMS Shield helps disabled people get medical guidance and know their legal rights at every step of health care. Take a photo of a problem area or describe it, see what it could be and how soon to get care, then see what it could cost, what protects you, and what accommodations you can ask for. One click turns that into a letter you can send.

It works three ways: **Voice mode** for blind or low vision users, **Text mode** for deaf or hard of hearing users, and **Hands-free mode** for people with limited movement.

> General information, not medical or legal advice. In an emergency, call 911.

## Setup

Requires Node 18 or newer.

```bash
npm install
cp .env.example .env   # then add your keys
npm start              # or: npm run dev (restarts on changes)
```

Open http://localhost:3000.

### Keys (`.env`)

Everything runs on free tiers.

| Key | Free? | Used for | Without it |
| --- | --- | --- | --- |
| `GROQ_API_KEY` | Free tier, no card | Chatbot, symptom checker, photo analysis (`qwen/qwen3.8-27b`), backup speech to text | Built-in answers, "describe it in words" |
| `ELEVENLABS_API_KEY` | Free tier, about 10,000 characters a month | All voice: spoken guidance and speech to text | Browser speech voice and recognition |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | Optional | Not needed. Hands-free face tracking runs free in the browser with MediaPipe. Rekognition is only a backup if set. | Large on-screen Back, Next and Select buttons, plus keyboard |

Optional and paid: `OPENAI_API_KEY` (used only if there is no Groq key), `ANTHROPIC_API_KEY`. Optional free: `GEMINI_API_KEY`. Model overrides: `GROQ_MODEL`, `GROQ_VISION_MODEL`, `GROQ_STT_MODEL`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`.

`.env` is in `.gitignore`. All keys stay on the server; the browser only talks to the routes below.

## Setting up the keys, step by step

You only add keys to the `.env` file in the project folder. Never paste them anywhere else. After any change to `.env`, stop the server (Ctrl + C in its terminal) and start it again with `npm start`, because the server only reads `.env` when it starts.

Check what is working at http://localhost:3000/api/status. Each service shows `true` or `false`.

### Groq (chat, photo check, speech to text). Free, no card.
1. Go to https://console.groq.com and sign in with Google or email.
2. Click **API Keys** in the left menu, then **Create API Key**. Name it `sms-shield` and click **Submit**.
3. Copy the key (it starts with `gsk_`). It is shown only once.
4. In `.env`, set `GROQ_API_KEY=gsk_...`

### ElevenLabs (the voice). Free tier, no card.
1. Go to https://elevenlabs.io and click **Sign up**. Use email or Google and confirm your email.
2. Skip any onboarding questions. You land on the dashboard.
3. Bottom left, click your name or profile icon, then **API Keys**. (On some layouts it is under **Developers**, then **API Keys**.)
4. Click **Create API Key**. Name it `sms-shield`.
5. If it asks about permissions or "Restrict key", leave it unrestricted, or turn on **Text to Speech** and **Speech to Text**.
6. Click **Create**, then copy the key right away. It is shown only once.
7. In `.env`, add `ELEVENLABS_API_KEY=` followed by the key, with no spaces or quotes.
8. Restart the server. `/api/status` should now show `"voice": true`.
9. Test it: open the site, press the space bar on the first screen for Full access, and the welcome message plays in the ElevenLabs voice.

If the voice still sounds robotic, look at the server terminal. A line starting with `elevenlabs error` says why:
- `401` means the key was copied wrong.
- `402` or `quota` means the free monthly characters are used up.
- `paid_plan_required` or `voice_not_found` means that voice is not available on a free account. The app uses Sarah, a built-in voice free accounts can use. Fix it: in ElevenLabs open **Voices**, pick any voice, click **...** then **Copy voice ID**, and add `ELEVENLABS_VOICE_ID=` plus that ID to `.env`.

The free tier is about 10,000 characters a month. The app caches fixed phrases and reads short summaries to save them. When they run out, it switches to the browser voice on its own.

### AWS Rekognition (optional, not needed)
Hands-free face tracking now runs free in the browser. Only follow these steps if you want Rekognition as a backup. Needs a card to sign up.
AWS asks for a credit or debit card even for the free plan. New accounts get free credits. Rekognition face checks cost about $0.001 each after that, and hands-free mode sends about 100 a minute, so only turn it on while demoing.

**Create the account**
1. Go to https://aws.amazon.com and click **Create an AWS Account**.
2. Enter your email and an account name such as `sms-shield`, then type the code AWS emails you.
3. Set a password. Choose the **Free** plan if you are offered a choice.
4. Choose **Personal** for the account type and fill in your contact details.
5. Enter a card. AWS may place a small temporary hold to check it.
6. Confirm your phone number with the text or call code.
7. Choose the **Basic support (free)** plan and finish. Sign in to the **Console** as the root user.
8. Recommended: search for **Budgets** at the top, click **Create budget**, and choose **Zero spend budget**, so AWS emails you if anything starts to cost money.

**Make a key that can only check faces**
1. In the top search bar type **IAM** and open it.
2. Click **Users** in the left menu, then **Create user**.
3. User name `sms-shield`. Leave "Provide user access to the AWS Management Console" **unchecked**. Click **Next**.
4. Choose **Attach policies directly**, then click **Create policy**. A new tab opens.
5. In the new tab click **JSON**, delete what is there, and paste:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow", "Action": "rekognition:DetectFaces", "Resource": "*" }
     ]
   }
   ```
6. Click **Next**, name it `sms-shield-faces`, and click **Create policy**. Close that tab.
7. Back on the user tab, click the refresh button beside the policy list, search `sms-shield-faces`, tick it, and click **Next**, then **Create user**.
8. Click the new `sms-shield` user, open the **Security credentials** tab, scroll to **Access keys**, and click **Create access key**.
9. Choose **Application running outside AWS**, click **Next**, then **Create access key**.
10. Copy the **Access key** and the **Secret access key**, or click **Download .csv file**. The secret is shown only once.

**Add them to `.env`**
```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```
Restart the server. `/api/status` should show `"rekognition": true`. Test it: on the first screen press 4 (limited movement), allow the camera, and turn your head. The legend in the hands-free panel lights up. If left and right feel reversed, tick **Swap left and right**.

If face control says it stopped working, look in the server terminal for `rekognition error`:
- `UnrecognizedClientException` or `InvalidSignatureException` means a key was copied wrong.
- `AccessDeniedException` means the policy is not attached to the user.

When the hackathon is over, you can delete the access key in IAM so it can never be used again.

## How it is built

- **Server:** Node and Express (`server.js`). Routes: `/api/chat`, `/api/symptoms`, `/api/vision`, `/api/face`, `/api/tts`, `/api/stt`, `/api/status`. Every route returns a clear fallback signal when its service is missing, so the app never dead ends.
- **Front end:** plain HTML, CSS and JavaScript in `public/`. No build step.
  - `legal.js`: the shared legal layer. Loaded by the browser and imported by the server.
  - `a11y.js`: modes, spoken guidance, captions, voice commands, focus handling.
  - `app.js`: pages, photo check, next steps, letters, summary, bill check, chat.
  - `handsfree.js`: face gestures through Rekognition.
  - `walkthrough.js`: the home page walkthrough.
  - `home.js`: disability guides, display settings, visit checklist, numbers to know.
  - `dictate.js`: the microphone on every text box.
  - `assets/`: the SMS Shield logo, the logo with the gavel, and the gavel used in the home page lens.
  - `motion.js`: word blur-in headings, highlight sweeps, card spotlights, the scroll line and the FAQ.
- **Privacy:** photos, camera frames and audio are processed in memory for one request and never saved or logged. Check results and letter details stay in memory in the browser.

## Accessibility features

- The site opens with a short logo intro (any key skips it). Then, before entering, visitors choose what fits: full access (space bar), blind or low vision (1), deaf or hard of hearing (2), cannot speak (3), or limited movement (4).
- The first screen assumes nothing about who is visiting. It works with no sight (the focused heading is read by screen readers), no hearing (it is all text) and no voice (one key). Press the space bar for **Full access**: everything is read out loud and shown as captions, and you never need to speak.
- Four modes chosen on the welcome screen with keys 1 to 4, by voice, or by clicking: Voice, Text, Hands-free and Full access.
- A home page section for each kind of disability (blind or low vision, deaf or hard of hearing, limited movement, thinking and memory, mental health) with how the app helps, what to ask for at a visit, and the rights behind it.
- Speak instead of typing: every text box has a microphone button.
- Read a summary aloud on any page, or "read everything" for the full text.
- Display settings on the home page: high contrast, larger text, and calm mode (no motion).
- A before-your-visit checklist and numbers to know (911, 988, 711 relay, and disability and billing help lines).
- **Voice mode:** "Press any key or say start", then every page, result, rights check, and letter is read aloud in one calm ElevenLabs voice. Voice commands for pages, "read results", "next", "select", "take photo", and "ask" plus a question. Fixed phrases are cached so they play instantly.
- **Text mode:** everything spoken also appears as captions. Nothing depends on sound. Rights show as readable cards.
- **Hands-free mode:** face tracking in the browser (MediaPipe, free, frames never leave the device) reads head turns (next and back), an open mouth (select), and eyes closed for two seconds (read the page aloud). If it notices signs of distress, the help chat gently asks if you want help or urgent care options. It does not read sign language. Large Back, Next and Select buttons are always there.
- A 3, 2, 1 photo countdown that is shown large and spoken.
- **Help** (opens the chat) and **Read this page aloud** buttons on every page.
- Skip to content link, landmarks, ARIA labels, live regions, visible focus rings, keyboard only operation, 44px or larger tap targets, high contrast and larger text options.
- Plain, short language. Respects reduced motion: all animation turns off except the countdown number.
- Kind error messages with a manual fallback for camera denied, microphone denied, and any service being down.

## Legal features

- **One shared legal layer** (`public/legal.js`) used by every screen and by the chatbot.
- **Disability rights in health care:** ADA Title II and III (equal access, effective communication, reasonable changes), Section 504, ACA Section 1557, free qualified interpreters, accessible formats, no fees for access help, service animals, accessible exam rooms.
- **Billing and coverage rights:** No Surprises Act, Good Faith Estimates, IRS 501(r) charity care with a poverty level estimate, EMTALA, community health center sliding fees, insurance appeals, Medicaid fair hearings.
- Each rule is short, in plain words, with the law name and citation. Anything without a confirmed citation is labeled "General principle".
- **Rights at every step:** after a photo check, a "What this could cost and what protects you" panel. On next steps, each option shows the accommodation to ask for and its billing rights. The summary lists them again.
- **One click letters:** accommodation request, billing dispute, financial help request, Good Faith Estimate dispute, itemized bill request, and insurance appeal, filled in with your details.
- **Precedent and outcomes:** when an issue is flagged, similar authority from the app's own data, typical dispute steps, and outcome language clearly labeled as an estimate. No invented cases or success rates.
- **Chatbot:** answers medical and legal questions together, adds a "Your rights" note with citations from the legal layer, and always says "I am not a doctor or lawyer."
- Every legal output says "General information, not legal advice."
