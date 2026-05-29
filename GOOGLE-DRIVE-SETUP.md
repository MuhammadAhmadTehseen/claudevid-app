# Google Drive Setup
_For uploading rendered videos back to Drive automatically_

## For Download (simpler — required)
The video you share must be set to "Anyone with the link can view".
Right-click file in Drive → Share → Change to "Anyone with the link".
The render server downloads it automatically.

## For Upload (optional — enhanced experience)
Requires a Google Service Account.

### Create Service Account
1. Go to https://console.cloud.google.com
2. Create a new project (or use existing)
3. Enable Google Drive API
4. IAM & Admin → Service Accounts → Create Service Account
5. Name: `claudevid-uploader`
6. Create and download JSON key → save as `render-server/google-service-account.json`

### Share Upload Folder
1. Create a folder in your Google Drive called "ClaudeVid Outputs"
2. Share that folder with the service account email (from the JSON file, `client_email` field)
3. Give it "Editor" permissions
4. Copy the folder ID from the URL: `drive.google.com/drive/folders/FOLDER_ID_HERE`
5. Add to `render-server/.env`: `GOOGLE_DRIVE_UPLOAD_FOLDER_ID=FOLDER_ID_HERE`

### Test Upload
Start the render server and check `/health` — it will show `driveUpload: true` if configured.
