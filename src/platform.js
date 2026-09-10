/**
 * Jembatan platform.
 *
 * Aplikasi berjalan pada dua sasaran: peramban desktop dan WebView Android
 * hasil bungkusan Capacitor. Perbedaan perilaku yang penting ada pada dua hal —
 * pengambilan citra dan penyimpanan berkas — karena elemen <a download> tidak
 * berfungsi di WebView Android. Seluruh cabang platform dikurung di berkas ini
 * agar antarmuka tidak perlu mengetahuinya.
 */

import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const isNative = () => Capacitor.isNativePlatform();
export const isNativeAndroid = () => isNative() && Capacitor.getPlatform() === 'android';

/**
 * Mengambil satu citra dari kamera perangkat. Di peramban, fungsi ini tidak
 * dipakai — antarmuka memakai pemilih berkas biasa.
 */
export async function capturePhoto() {
  const photo = await Camera.getPhoto({
    quality: 88,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
    correctOrientation: true,
    saveToGallery: false,
  });
  return photo?.dataUrl || '';
}

function base64FromDataUrl(dataUrl) {
  return String(dataUrl || '').split(',')[1] || '';
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Berkas gagal disiapkan.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Menyimpan berkas hasil ekspor. Di Android berkas ditulis ke Documents lalu
 * dibagikan melalui lembar berbagi sistem; di peramban dipakai unduhan biasa.
 * Mengembalikan keterangan singkat tentang tujuan penyimpanan.
 */
export async function saveBinaryFile({ filename, blob, dataUrl, mimeType }) {
  const resolvedDataUrl = dataUrl || (blob ? await blobToDataUrl(blob) : '');
  if (!resolvedDataUrl) throw new Error('Tidak ada data untuk disimpan.');

  if (!isNative()) {
    const href = blob ? URL.createObjectURL(blob) : resolvedDataUrl;
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.click();
    if (blob) URL.revokeObjectURL(href);
    return { target: 'browser', filename };
  }

  const written = await Filesystem.writeFile({
    path: filename,
    data: base64FromDataUrl(resolvedDataUrl),
    directory: Directory.Documents,
    recursive: true,
  });

  try {
    await Share.share({
      title: filename,
      url: written.uri,
      dialogTitle: 'Bagikan atau simpan berkas',
    });
  } catch (error) {
    // Pemakai membatalkan lembar berbagi; berkas tetap tersimpan di Documents.
  }

  return { target: 'android', filename, uri: written.uri, mimeType };
}
