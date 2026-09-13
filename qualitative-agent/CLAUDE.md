# Instruksi Proyek untuk Claude Code

Proyek ini adalah agen analisis kualitatif lokal. Sebelum menulis atau mengubah kode:

1. JANGAN menyatukan logika TA, RTA, IPA, dan GT ke dalam satu fungsi/modul bersama.
   Setiap metode adalah modul terpisah di src/coding/.
2. Setiap tabel `codes` dan `categories` di database punya kolom `status` yang default
   'proposed'. JANGAN pernah set otomatis ke 'validated' dari kode — itu hanya boleh
   berubah lewat src/validation/review_queue.py atas aksi manusia.
3. data/raw/ bersifat read-only. Tidak ada fungsi apa pun yang menulis ke folder ini.
4. Setiap pemanggilan Anthropic API WAJIB dicatat lewat src/audit/audit_logger.py
   sebelum fungsi pemanggil mengembalikan hasil ke caller-nya.
5. Untuk IPA: proses dokumen per participant_id secara idiografis dulu (satu kasus
   tuntas dianalisis) sebelum cross-case analysis (GET) dijalankan.
6. Untuk GT: jangan bangun pipeline satu arah. Sediakan fungsi yang bisa dipanggil
   ulang untuk constant comparison ketika ada unit/dokumen baru.
