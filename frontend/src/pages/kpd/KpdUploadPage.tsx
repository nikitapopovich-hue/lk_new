import { useState } from "react";
import { KpdInstructionModal } from "../../components/kpd/KpdInstructionModal";
import { KPD_UPLOAD_SLOTS } from "./kpdMockData";

export function KpdUploadPage() {
  const [instructionOpen, setInstructionOpen] = useState(false);

  return (
    <>
      <div className="kpd-page__head mt-4">
        <h1 className="kpd-page__title">Загрузка файлов и запуск расчёта</h1>
        <button
          type="button"
          className="kpd-instruction-btn"
          onClick={() => setInstructionOpen(true)}
          aria-haspopup="dialog"
        >
          <span className="kpd-instruction-btn__icon" aria-hidden>
            <img src="/info-circle.svg" alt="" aria-hidden />
          </span>
          Инструкция
        </button>
      </div>

      <div className="kpd-filters">
        <div className="kpd-field">
          <label htmlFor="kpd-upload-period">Период</label>
          <input id="kpd-upload-period" type="month" defaultValue="2024-05" disabled />
        </div>
        <div className="kpd-field">
          <label htmlFor="kpd-upload-mode">Режим</label>
          <select id="kpd-upload-mode" defaultValue="manual" disabled>
            <option value="auto">auto (только UIS)</option>
            <option value="hybrid">hybrid (UIS + Usedesk)</option>
            <option value="manual">manual (все 7 файлов)</option>
          </select>
        </div>
        <label className="kpd-check">
          <input type="checkbox" defaultChecked disabled />
          Force (пересчитать)
        </label>
        <label className="kpd-check">
          <input type="checkbox" disabled />
          Strict
        </label>
      </div>

      <section className="kpd-files-panel" aria-labelledby="kpd-files-title">
        <h2 id="kpd-files-title" className="kpd-files-panel__title">
          Файлы
        </h2>
        {KPD_UPLOAD_SLOTS.map((slot) => (
          <div key={slot.id} className="kpd-file-row">
            <div className="kpd-file-row__main">
              <p className="kpd-file-row__label m-0">
                {slot.label} <span>({slot.hint})</span>
              </p>
              <span className="kpd-file-row__status">Не выбран ни один файл</span>
            </div>
            <div className="kpd-file-row__actions">
              <button type="button" className="kpd-btn kpd-btn--ghost" disabled>
                Выбор файла
              </button>
              <button type="button" className="kpd-btn kpd-btn--ghost" disabled>
                Загрузить
              </button>
              <span className="kpd-file-row__status">— не загружено</span>
            </div>
          </div>
        ))}
      </section>

      <button type="button" className="kpd-btn kpd-btn--primary" disabled>
        Посчитать
      </button>

      <KpdInstructionModal open={instructionOpen} onClose={() => setInstructionOpen(false)} />
    </>
  );
}
