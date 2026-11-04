# Diagram Sistem - Mekanisme Insentif Peer Review

Diagram dipisah satu diagram per file:

- [ojs-incentive/docs/diagram-class.md](ojs-incentive/docs/diagram-class.md)
- [ojs-incentive/docs/diagram-sequence.md](ojs-incentive/docs/diagram-sequence.md)
- [ojs-incentive/docs/diagram-dfd-level-1.md](ojs-incentive/docs/diagram-dfd-level-1.md)
- [ojs-incentive/docs/diagram-dfd-level-0.md](ojs-incentive/docs/diagram-dfd-level-0.md)
- [ojs-incentive/docs/diagram-activity.md](ojs-incentive/docs/diagram-activity.md)

---

## Catatan untuk Bab 3

**Kapan distribusi dijalankan?**
Distribusi di-trigger ketika **semua reviewer dalam satu batch telah menyelesaikan review** dan editor telah memberikan skor accuracy (q3). Ini mengikuti model batch-based escrow:

1. Author membuat batch + deposit
2. Editor assign reviewer ke batch
3. Setiap reviewer submit review (async, independent)
4. Setelah semua submit -> editor evaluate accuracy
5. System otomatis menjalankan pipeline (Normalization -> Weighting -> TOPSIS -> Sigmoid -> Distribusi)

**Batasan q2 dan q3:**
- **q2 (Depth):** Dihitung secara heuristik dari teks review (word count, structural indicators, specificity of references). Ini adalah **batasan penelitian** - implementasi production akan memerlukan NLP/LLM scoring.
- **q3 (Accuracy):** Ditentukan oleh editor berdasarkan rasio saran reviewer yang diterima. Ini tetap manual karena memerlukan domain expertise.
