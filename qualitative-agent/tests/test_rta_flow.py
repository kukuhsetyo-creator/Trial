"""Uji alur RTA dari coding inisial sampai peninjauan manusia.

Pemanggilan model distub sepenuhnya: yang diuji adalah mekanika modul, yaitu
bahwa status tidak pernah menyimpang dari 'proposed' kecuali lewat antrean
peninjauan, bahwa audit trail terisi, bahwa hitungan frekuensi tidak pernah
sampai ke prompt pembentukan tema, dan bahwa penamaan tema terhalang ketika
peneliti belum menulis memo reflektifnya sendiri.

Jalankan: python -m unittest discover -s tests
"""

from __future__ import annotations

import json
import re
import sys
import tempfile
import types
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src import db as db_module  # noqa: E402


def stub_message(text: str):
    return types.SimpleNamespace(
        content=[types.SimpleNamespace(type="text", text=text)],
        model="claude-sonnet-5",
        stop_reason="end_turn",
        usage=types.SimpleNamespace(input_tokens=100, output_tokens=50),
    )


class StubClient:
    """Menjawab berdasarkan tahap yang terbaca dari prompt, dan merekam setiap prompt."""

    def __init__(self):
        self.prompts: list[str] = []
        self.messages = types.SimpleNamespace(create=self._create)

    def _create(self, **kwargs):
        prompt = kwargs["messages"][0]["content"]
        self.prompts.append(prompt)
        if "coding inisial line-by-line" in prompt:
            return stub_message(json.dumps([
                {"label": "menormalkan beban kerja", "justification": "lembur disebut 'sudah biasa'"},
                {"label": "aturan yang tidak dijalankan", "justification": "SK disebut namun tidak dirujuk"},
            ], ensure_ascii=False))
        if "usulkan pola tema" in prompt:
            ids = [int(x) for x in re.findall(r"^- \[(\d+)\]", prompt, flags=re.M)]
            return stub_message(json.dumps([{
                "label": "kewajaran yang dipelihara bersama",
                "story": "Beban kerja berlebih dipertahankan sebagai hal biasa karena semua orang menanggungnya.",
                "code_ids": ids[:3],
                "quote": "Ya sudah biasa lembur",
            }], ensure_ascii=False))
        if "Tinjau tema berikut" in prompt:
            return stub_message("Tema memiliki inti yang jelas namun batasnya masih longgar terhadap kode tentang aturan formal.")
        if "Susun definisi dan nama akhir" in prompt:
            return stub_message(json.dumps([{
                "label": "sudah biasa: kewajaran yang dipelihara bersama",
                "definition": "Tema ini menangkap cara beban kerja berlebih dipertahankan sebagai kewajaran melalui kesaksian kolektif bahwa semua orang mengalaminya.",
                "quote": "Ya sudah biasa lembur",
            }], ensure_ascii=False))
        if "memo reflektif" in prompt:
            return stub_message("Saya menyadari kecenderungan membaca keluhan di tempat partisipan mungkin menyatakan penerimaan.")
        return stub_message("[]")


class RTAFlowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        cls.db_path = Path(cls._tmp.name) / "uji.db"
        db_module.DB_PATH = cls.db_path
        schema = (PROJECT_ROOT / "db" / "schema.sql").read_text(encoding="utf-8")
        conn = db_module.connect()
        conn.executescript(schema)
        conn.commit()

        # Satu dokumen dan empat unit, disisipkan langsung agar uji ini tidak
        # bergantung pada berkas di data/raw.
        doc = conn.execute(
            "INSERT INTO documents (title, source_type, file_path, participant_id) VALUES (?,?,?,?)",
            ("Wawancara uji", "interview_transcript", "uji.txt", "P01"),
        ).lastrowid
        for i, teks in enumerate([
            "Ya sudah biasa lembur, aturannya sih ada tapi ya begitu.",
            "Semua orang begitu, jadi kalau saya protes ya aneh.",
            "Di SK-nya jelas jam kerja itu berapa.",
            "Tidak ada yang berani menghitung itu.",
        ]):
            conn.execute(
                "INSERT INTO units (document_id, sequence_index, speaker, text) VALUES (?,?,?,?)",
                (doc, i, "P01", teks),
            )
        conn.commit()
        conn.close()
        cls.document_id = doc

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def test_alur_lengkap(self):
        from src.coding import rta
        from src.memo import memo_writer
        from src.store import fetch_categories, fetch_codes
        from src.validation import review_queue

        client = StubClient()
        config = rta.load_config()
        run_id = rta.start_run("Uji RTA", config=config)

        # --- coding inisial ---
        hasil = rta.code_units(run_id, document_id=self.document_id, config=config, client=client)
        self.assertEqual(hasil["unit_diproses"], 4)
        self.assertEqual(hasil["kode_tersimpan"], 8)
        self.assertEqual(hasil["unit_gagal"], [])

        codes = fetch_codes(run_id)
        self.assertTrue(codes)
        self.assertTrue(all(c["status"] == "proposed" for c in codes),
                        "kode tidak boleh lahir dengan status selain 'proposed'")
        self.assertTrue(all(c["created_by"] == "model" for c in codes))

        # --- pembentukan tema ---
        tema = rta.generate_themes(run_id, config=config, client=client)
        self.assertEqual(len(tema["tema"]), 1)
        self.assertGreater(tema["tema"][0]["kode_tertaut"], 0)

        kategori = fetch_categories(run_id)
        self.assertTrue(all(k["status"] == "proposed" for k in kategori))
        self.assertTrue(all(k["category_type"] == "theme" for k in kategori))

        # --- daftar kode yang dikirim ke prompt tema tidak memuat hitungan apa pun ---
        # Kata "frekuensi" memang muncul pada instruksi RTA sebagai larangan; yang
        # diperiksa di sini adalah bagian daftar kode, tempat data prevalensi akan
        # bocor bila ia pernah dihitung.
        prompt_tema = next(p for p in client.prompts if "usulkan pola tema" in p)
        daftar_kode = prompt_tema.split("Kode: ", 1)[1].split("Jawab HANYA", 1)[0]
        for penanda in ("frekuensi", "jumlah", "prevalensi", "kemunculan", "total"):
            self.assertNotIn(penanda, daftar_kode.lower())
        self.assertNotRegex(daftar_kode, r"\(\d+ ?x\)")
        id_terkirim = [int(x) for x in re.findall(r"^- \[(\d+)\]", daftar_kode, flags=re.M)]
        self.assertEqual(sorted(id_terkirim), sorted(c["id"] for c in codes),
                         "setiap kode dikirim tepat satu kali, tanpa pengulangan yang menyiratkan bobot")

        # --- peninjauan tema ---
        tinjauan = rta.review_themes(run_id, config=config, client=client)
        self.assertEqual(tinjauan["tema_ditinjau"], 1)

        # --- gerbang refleksivitas ---
        with self.assertRaises(rta.ReflexivityRequired):
            rta.define_and_name_themes(run_id, config=config, client=client)

        memo_writer.save_memo(run_id, "Saya condong membaca ini sebagai keluhan.", created_by="human")
        dinamai = rta.define_and_name_themes(run_id, config=config, client=client)
        self.assertEqual(len(dinamai["tema_dinamai"]), 1)
        self.assertNotEqual(dinamai["tema_dinamai"][0]["label_lama"],
                            dinamai["tema_dinamai"][0]["label_baru"])

        # penamaan tidak mengubah status
        self.assertTrue(all(k["status"] == "proposed" for k in fetch_categories(run_id)))

        # --- penolakan metrik antarpenilai ---
        with self.assertRaises(rta.InterraterMetricRefused):
            rta.compute_interrater_reliability(run_id)

        # --- antrean peninjauan manusia ---
        antre = review_queue.pending(run_id, target_type="code")
        self.assertEqual(len(antre), 8)

        review_queue.validate("code", antre[0]["id"], reviewer_note="tepat")
        review_queue.reject("code", antre[1]["id"], reviewer_note="terlalu dekat dengan parafrase")
        review_queue.revise("code", antre[2]["id"], new_label="menormalkan lembur",
                            reviewer_note="label dipersempit")
        theme_id = fetch_categories(run_id)[0]["id"]
        review_queue.validate("category", theme_id, reviewer_note="tema dipertahankan")

        ringkasan = review_queue.summary(run_id)
        self.assertEqual(ringkasan["code"]["validated"], 1)
        self.assertEqual(ringkasan["code"]["rejected"], 1)
        self.assertEqual(ringkasan["code"]["revised"], 1)
        self.assertEqual(ringkasan["code"]["proposed"], 5)
        self.assertEqual(ringkasan["category"]["validated"], 1)

        riwayat = review_queue.history("code", antre[2]["id"])
        self.assertEqual(riwayat[0]["previous_label"], antre[2]["label"])
        self.assertEqual(riwayat[0]["new_label"], "menormalkan lembur")

        # --- audit trail memuat setiap pemanggilan ---
        conn = db_module.connect()
        tahap = {r[0]: r[1] for r in conn.execute(
            "SELECT stage, COUNT(*) FROM audit_log WHERE method_run_id = ? GROUP BY stage", (run_id,)
        )}
        conn.close()
        self.assertEqual(tahap["open_coding"], 4)
        self.assertEqual(tahap["theme_generation"], 1)
        self.assertEqual(tahap["theme_review"], 1)
        self.assertEqual(tahap["theme_definition_naming"], 1)
        self.assertIn("reflexive_memo", tahap)
        self.assertEqual(sum(tahap.values()), len(client.prompts))

    def test_revisi_tanpa_perubahan_ditolak(self):
        from src.validation import review_queue
        with self.assertRaises(review_queue.ReviewError):
            review_queue.revise("code", 1)

    def test_store_tidak_menerima_parameter_status(self):
        import inspect

        from src import store
        for nama, fungsi in inspect.getmembers(store, inspect.isfunction):
            if nama.startswith("_"):
                continue
            self.assertNotIn(
                "status", inspect.signature(fungsi).parameters,
                f"store.{nama} tidak boleh menerima parameter status",
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
