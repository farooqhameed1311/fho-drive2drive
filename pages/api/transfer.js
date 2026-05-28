import { google } from 'googleapis';
import { getToken } from "next-auth/jwt";
import { Readable } from 'stream';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed' });

  // 1. Verify user is logged in and retrieve their secure token
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.accessToken) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please sign in to connect your Drive.' });
  }

  try {
    const { uploadType, sourceFileId, destFolderId, fileName, mimeType, base64Data } = req.body;

    // 2. Authenticate the Google Drive API acting as the USER
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: token.accessToken });
    const drive = google.drive({ version: 'v3', auth });

    // 3. EXECUTE: Cloud-to-Cloud (Drive to Drive)
    if (uploadType === "d2d") {
      const copyParams = {
        fileId: extractId(sourceFileId),
        requestBody: {},
        fields: 'id, webViewLink',
      };

      if (destFolderId) {
        copyParams.requestBody.parents = [extractId(destFolderId)];
      }

      // This uses the USER'S quota and permissions
      const copiedFile = await drive.files.copy(copyParams);

      return res.status(200).json({ success: true, fileUrl: copiedFile.data.webViewLink });
    }

    // 4. EXECUTE: Local Device Upload
    if (uploadType === "local") {
      const fileBuffer = Buffer.from(base64Data, 'base64');
      const stream = new Readable();
      stream.push(fileBuffer);
      stream.push(null);

      const fileMetadata = { name: fileName };
      if (destFolderId) fileMetadata.parents = [extractId(destFolderId)];

      const media = { mimeType: mimeType, body: stream };

      const uploadedFile = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, webViewLink',
      });

      return res.status(200).json({ success: true, fileUrl: uploadedFile.data.webViewLink });
    }

    return res.status(400).json({ success: false, error: 'Invalid upload type specified.' });

  } catch (error) {
    console.error('Drive API Error:', error.message);
    return res.status(500).json({ success: false, error: 'Transfer failed. Please verify file permissions.' });
  }
}

// Utility to clean up Google Drive Links
function extractId(input) {
  if (!input) return null;
  const match = input.match(/[-\w]{25,}/);
  return match ? match[0] : input;
}
