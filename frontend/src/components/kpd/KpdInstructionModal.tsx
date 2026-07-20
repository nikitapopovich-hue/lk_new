import { useEffect } from "react";
import { createPortal } from "react-dom";
import "./KpdInstructionModal.css";

const panelSurface =
  "kpd-instruction-dialog rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-[rgba(6,11,38,0.96)] to-[rgba(26,31,55,0.96)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_64px_rgba(0,0,0,0.45)]";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function KpdInstructionModal(props: Props) {
  useEffect(() => {
    if (!props.open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") props.onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  return createPortal(
    <div className="kpd-instruction-backdrop" role="presentation" onClick={props.onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kpd-instruction-title"
        className={`${panelSurface} scrollbar-pari`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="kpd-instruction-dialog__head">
          <h2 id="kpd-instruction-title" className="kpd-instruction-dialog__title">
            Инструкция
          </h2>
          <button
            type="button"
            className="kpd-instruction-dialog__close"
            onClick={props.onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>

        <div className="kpd-instruction-dialog__body">
          <h3 className="kpd-instruction-dialog__section-title">Режим (mode)</h3>

          <dl className="kpd-instruction-list">
            <div className="kpd-instruction-list__item">
              <dt>auto</dt>
              <dd>
                Полностью автоматизированный подсчёт через сбор данных по API. Примечание: usedesk-каналы не
                учтут тех, кто на момент запуска уволен — у них в «Тикетах» и «СММ» будет 0, и это влияет на
                точность результатов.
              </dd>
            </div>
            <div className="kpd-instruction-list__item">
              <dt>hybrid</dt>
              <dd>
                Полуавтоматизированный подсчёт. Загруженные файлы по каналам считаются источником правды,
                остальные тянутся по API. Оптимальный вариант для точных результатов: загрузить как минимум{" "}
                <code>usedesk/smm</code> и <code>usedesk/tickets</code>, чтобы у уволившихся были корректные
                значения.
              </dd>
            </div>
            <div className="kpd-instruction-list__item">
              <dt>manual</dt>
              <dd>
                Подсчёт основан только на загруженных файлах (исключение — ОВВ). Необходимо, чтобы были
                загружены все 7 файлов по всем необходимым каналам данных.
              </dd>
            </div>
          </dl>

          <h3 className="kpd-instruction-dialog__section-title">Дополнительные опции</h3>

          <dl className="kpd-instruction-list">
            <div className="kpd-instruction-list__item">
              <dt>Force (пересчитать)</dt>
              <dd>
                Выберите, если успешные подсчёты за выбранный месяц уже есть, но вы хотите совершить
                повторный подсчёт.
              </dd>
            </div>
            <div className="kpd-instruction-list__item">
              <dt>Strict</dt>
              <dd>
                Требует распределения всех распознанных со всех каналов и отделов сотрудников для корректной
                работы (функционал для личного кабинета, пока что лучше не выбирать).
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>,
    document.body,
  );
}
