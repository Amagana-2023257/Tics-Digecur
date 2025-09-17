// server/drive.js
import { google } from 'googleapis';
import { Readable } from 'stream';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

let driveClient = null;

/** Inicializa el cliente de Google Drive con Service Account */
export async function initDrive() {
  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error(
      'Faltan GOOGLE_DRIVE_CLIENT_EMAIL o GOOGLE_DRIVE_PRIVATE_KEY en el .env'
    );
  }

  // Soporte para \n escapados en .env
  privateKey = privateKey.replace(/\\n/g, '\n');

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: SCOPES,
  });

  await auth.authorize();
  driveClient = google.drive({ version: 'v3', auth });
  console.log('Google Drive conectado');
  return driveClient;
}

export function getDrive() {
  if (!driveClient) {
    throw new Error('Drive no inicializado. Llama initDrive() primero.');
  }
  return driveClient;
}

/**
 * Sube un archivo (buffer) a Google Drive.
 * @param {Object} opts
 * @param {Buffer} opts.buffer - Contenido del archivo.
 * @param {String} opts.filename - Nombre final (con extensión).
 * @param {String} opts.mimeType - MIME del archivo.
 * @param {String} [opts.folderId=process.env.CARDEX_DRIVE_FOLDER_ID] - Carpeta destino.
 * @param {Boolean} [opts.makePublic=false] - Si true, asigna permiso "anyone:reader".
 */
export async function uploadBufferToDrive({
  buffer,
  filename,
  mimeType,
  folderId = process.env.CARDEX_DRIVE_FOLDER_ID,
  makePublic = false,
}) {
  const drive = getDrive();
  const bodyStream = Readable.from(buffer);

  const { data } = await drive.files.create({
    requestBody: {
      name: filename,
      parents: folderId ? [folderId] : undefined,
    },
    media: {
      mimeType,
      body: bodyStream,
    },
    fields: 'id,name,mimeType,size,webViewLink,webContentLink,parents',
  });

  if (makePublic) {
    try {
      await drive.permissions.create({
        fileId: data.id,
        requestBody: { role: 'reader', type: 'anyone' },
      });
      // Opcional: volver a leer el archivo si quieres links actualizados.
      // const { data: refreshed } = await drive.files.get({
      //   fileId: data.id,
      //   fields: 'id,name,mimeType,size,webViewLink,webContentLink,parents',
      // });
      // return refreshed;
    } catch (e) {
      console.warn('No se pudo hacer público el archivo de Drive:', e.message);
    }
  }

  return data;
}
