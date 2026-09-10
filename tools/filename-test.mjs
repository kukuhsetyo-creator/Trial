/**
 * Uji pembersihan nama berkas ekspor.
 *
 * Filesystem.writeFile pada Android dipanggil dengan recursive, sehingga
 * pemisah jalur yang lolos tidak menimbulkan galat melainkan diam-diam membuat
 * direktori baru dan menulis berkas di luar folder Documents. Nama berkas
 * dirakit dari nama tes dan tanggal administrasi yang keduanya tersimpan di
 * localStorage, jadi bentuknya tidak dapat diandalkan sekadar karena berasal
 * dari kolom bertipe date.
 *
 * Jalankan: npm run test:filename
 */

import { sanitizeFilename } from '../src/platform.js';

const KASUS = [
  // Nama yang sah harus lolos tanpa perubahan.
  ['laporan-tes-inteligensi-kolektif-2026-09-10.pdf', 'laporan-tes-inteligensi-kolektif-2026-09-10.pdf'],
  ['rekap-tes-2026-09-10.csv', 'rekap-tes-2026-09-10.csv'],
  ['template-ljk-tes_potensi.pdf', 'template-ljk-tes_potensi.pdf'],

  // Pemisah jalur dan penelusuran direktori.
  ['laporan-x-../../../../sdcard/jahat.pdf', 'jahat.pdf'],
  ['..\\..\\windows\\system32\\evil.pdf', 'evil.pdf'],
  ['/etc/passwd', 'passwd'],
  ['../../rahasia.csv', 'rahasia.csv'],
  ['..', 'berkas'],
  ['.', 'berkas'],
  ['', 'berkas'],
  [null, 'berkas'],
  [undefined, 'berkas'],

  // Karakter yang tidak sah pada sistem berkas.
  ['laporan tes "psikologi" <2026>.pdf', 'laporan-tes-psikologi-2026-.pdf'],
  ['rekap null.csv', 'rekap-null.csv'],

  // Nama sangat panjang dipangkas, bukan ditolak.
  ['a'.repeat(400) + '.pdf', 'a'.repeat(120)],
];

let gagal = 0;
console.log('Uji pembersihan nama berkas\n');

for (const [masuk, harap] of KASUS) {
  const dapat = sanitizeFilename(masuk);
  const ok = dapat === harap;
  if (!ok) gagal += 1;
  const tampil = (value) => JSON.stringify(value ?? null);
  console.log(
    `${ok ? 'OK   ' : 'GAGAL'} ${tampil(masuk).slice(0, 46).padEnd(48)} -> ${tampil(dapat)
      .slice(0, 52)
      .padEnd(54)}${ok ? '' : ' harap ' + tampil(harap)}`,
  );
}

// Sifat yang harus berlaku untuk masukan apa pun, bukan hanya kasus di atas.
const ALFABET = 'abcXYZ019 ../\\:*?"<>|._- e';
const acak = Array.from({ length: 400 }, () =>
  Array.from({ length: 1 + Math.floor(Math.random() * 40) }, () =>
    ALFABET[Math.floor(Math.random() * ALFABET.length)],
  ).join(''),
);

// Yang harus dijamin adalah keluaran berupa satu segmen nama. Titik ganda di
// tengah nama tidak berbahaya begitu seluruh pemisah jalur hilang — penelusuran
// direktori menuntut ".." berdiri sebagai segmen utuh.
for (const masuk of acak) {
  const dapat = sanitizeFilename(masuk);
  const cacat =
    /[\\/]/.test(dapat) || dapat === '.' || dapat === '..' || !dapat.length || dapat.length > 120;
  if (cacat) {
    console.log(`GAGAL sifat: ${JSON.stringify(masuk)} -> ${JSON.stringify(dapat)}`);
    gagal += 1;
  }
}

console.log('\n' + (gagal ? `GAGAL: ${gagal} kasus.` : `LULUS: ${KASUS.length} kasus dan 400 masukan acak.`));
process.exit(gagal ? 1 : 0);
