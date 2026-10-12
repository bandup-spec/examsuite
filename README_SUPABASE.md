# BandUp → Supabase migration guide

Everything the Apps Script did now runs inside Supabase (Postgres). Your pages keep the same
look and the same flows; only the backend plumbing changed.

## What's in this folder

| File | What it is |
|---|---|
| `01_schema.sql` | Creates all tables + the secure `api()` function (replaces `Code.gs`). Run once. |
| `bandup-api.js` | Browser connector — holds your Supabase URL + public key. Replaces the Apps Script code that used to be pasted into every page. |
| `index.html` `tests.html` `profile.html` `admin.html` `simulation.html` | Your pages, already switched over. `admin.html` also has a new **🔑 Answer Keys** panel. |
| `MailRelay.gs` | A 20-line Apps Script that sends the OTP / alert e-mails from your Gmail (Supabase can't send mail by itself). |
| `import_from_sheets.py` | Optional — converts your Google Sheet exports into SQL so existing students and scores move over. |

Upload **all** the `.html` files **and `bandup-api.js`** to the same folder on your host.

## Setup (about 15 minutes)

### 1 · Create the database
1. supabase.com → **New project** (pick a region near your students). Save the database password somewhere safe.
2. **SQL Editor → New query** → paste all of `01_schema.sql` → **Run**. It ends with `BandUp schema ready ✔`.
3. Set your admin ("superadmin") password — run this with your own password:
   ```sql
   select app.set_admin_password('YourStrongPassword');
   ```

### 2 · Connect the pages
1. Supabase → **Project Settings → API**. Copy the **Project URL** and the **anon / publishable** key.
2. Open `bandup-api.js` and paste them into `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
   - The anon key is *meant* to be public. **Never** paste the `service_role` / `secret` key into any page.

### 3 · Turn on e-mail (registration codes, password reset, e-mail change)
1. Go to script.google.com → **New project** → paste `MailRelay.gs` and change `SECRET` to a long random string.
2. **Deploy → New deployment → Web app** → *Execute as: Me* · *Who has access: Anyone* → Deploy → copy the URL.
3. Back in the Supabase SQL Editor (same URL and secret):
   ```sql
   insert into app.secrets(key,value) values
     ('mail_webhook_url',    'https://script.google.com/macros/s/XXXX/exec'),
     ('mail_webhook_secret', 'THE-SAME-SECRET')
   on conflict (key) do update set value = excluded.value;

   select app.send_mail('your@email.com', 'BandUp test', 'It works!');   -- you should receive this
   ```
Optional: `update app.settings set value='you@email.com' where key='notify_email';` to get admin-login alerts.

### 4 · (Optional) bring your existing data
1. Export each Google Sheet tab as CSV: `Candidates.csv`, `Scores.csv`, `TestSets.csv`, `AnswerKeys.csv`, `Settings.csv`.
2. Put them next to `import_from_sheets.py` and run `python3 import_from_sheets.py`.
3. Paste the generated `import_data.sql` into the SQL Editor → Run.
   - Student passwords keep working and are upgraded to strong hashing at each student's next login.
   - The old admin password is **not** copied — use the one from step 1.3.

### 5 · Answer keys
Log in as superadmin → **🔑 Answer Keys** → pick the test set → enter or paste the keys → Save.
(If you imported `AnswerKeys.csv` they are already there.) Format: `1: B`, `2: TRUE`, `6: MOVIE | FILM`.

### 6 · Try it
Register a test student (the code arrives by e-mail) → approve them under **Candidates** → log in → take a short test → check **Scores**.

## What changed (and why)

**Security — the main reason to move**
- The old API key was visible in every page, so anyone could call `getAnswerKey`, `getCandidates`, `approveCandidate` and so on. Admin actions now need an **admin token** that only exists after the real admin password is entered (valid 12 hours).
- Candidate actions (scores, drafts, submit, profile) require the candidate's **session token**. Before, a missing token was silently allowed.
- Answer keys live in a table the browser can never read, and grading happens in the database.
- Passwords use **bcrypt** (old weak hashes are upgraded automatically).
- Brute-force protection: 5 wrong passwords → 15-minute lock; admin login is limited per IP; OTP codes are single-use, expire in 10 minutes and allow 5 tries.

**Fixes made along the way**
- Essays are no longer cut at 2,000 characters.
- Changing your password in Profile no longer logs you out of your own session (it used to issue a second token).
- Retaking a test no longer reloads the *previous* attempt's answers.
- A double submit caused by a slow connection is detected and doesn't create a second score row.
- The "signed in on another device" handler in the simulation no longer throws an error (`timerInterval` was undefined).
- Registration can only happen through the e-mail-verified path (the old direct path skipped the code).
- Logging out now clears the session, so the next person on a shared computer starts clean.

**Behaviour you might notice**
- Config files are fetched directly (your GitHub raw links work as before). The old Google Drive proxy is gone, so keep configs on GitHub.
- `getAnnouncements` now works. Add announcements with `insert into app.announcements(title,body) values ('Title','Text');`.

## TOEIC pages
`toeic-simulation.html` and `toeic-question-maker.html` weren't included, so they still point at Apps Script. They call the same actions, so switching each takes three edits:
1. Delete the `APPS_SCRIPT_URL` / `API_KEY` constants and the `callSheets…` functions.
2. Add `<script src="bandup-api.js"></script>` right before the page's main `<script>`.
3. (Simulation page) send the full writing text instead of `substring(0,2000)`.

Send them over and I'll convert them.

## Everyday admin SQL
```sql
select app.set_admin_password('NewPassword');                                  -- reset the admin password

update app.candidates set password_hash = app.hash_password('Temp1234'),
       locked_until = null, failed_attempts = 0
 where candidate_id = 'ABC-12345';                                            -- reset one student's password

update app.candidates set status = 'Approved' where status = 'Pending';       -- approve everyone waiting
```

## Good to know
- **E-mail delivery** is fire-and-forget: the app can't see whether Gmail accepted a message. If codes don't arrive, run the `send_mail` test above and check the Apps Script **Executions** page.
- Free Supabase projects pause after a week without activity — upgrade, or open the dashboard now and then.
- Candidate IDs can still be probed by typing them in (the login screen greets the student by name), as before. The brute-force limits above protect the passwords.
