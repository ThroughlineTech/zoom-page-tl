Publishing a Chrome extension goes through the Chrome Web Store Developer Dashboard. Here's the process.
First, the one-time setup: you need a developer account, which costs a one-time $5 registration fee paid to Google. Sign in at the Chrome Web Store Developer Dashboard (chromewebstore.google.com/devconsole) with the Google account you want to own the extension, pay the fee, and accept the developer agreement.
Then prepare your package. Your extension needs a valid manifest.json (make sure it's Manifest V3, since V2 is no longer accepted), and you zip up the entire extension folder—all the files at the root of the zip, not nested inside a subfolder. A common mistake is zipping the parent directory so the manifest ends up one level deep; the manifest must be at the top level of the zip.
Before uploading, get your store listing assets ready, because the dashboard will ask for them:

An icon (128×128 PNG) for the store
At least one screenshot (1280×800 or 640×400)
A short description and a detailed description
A category and the default language
Optionally a small promo tile (440×280) if you want better placement

You'll also need a privacy policy if your extension handles any user data, and you'll fill out the privacy/data-use disclosures regardless. Google is fairly strict here—you declare what permissions you use and justify them, and unjustified or overly broad permissions are a frequent rejection reason.
Once that's all in, you upload the zip in the dashboard, fill out the listing, set your visibility (public, unlisted, or private), set distribution regions, and submit for review. Review can take anywhere from a few hours to a couple of weeks depending on what permissions you request and whether anything triggers a closer look; extensions using sensitive permissions tend to take longer.
A few things worth knowing before you submit. Pick your visibility deliberately—unlisted is great if you just want to share a link without it showing up in search, which is handy for testing with real users first. Also, the package name and most listing details can be edited later, but once published, updates also go through review, so factor that into your release cadence.
Since policy details and the exact dashboard flow do change, do you want me to pull up Google's current official publishing documentation to confirm the latest requirements and any recent policy changes? I can also help with specific sticking points—writing permission justifications, the privacy disclosures, or debugging a rejected submission—if you tell me more about what your extension does.