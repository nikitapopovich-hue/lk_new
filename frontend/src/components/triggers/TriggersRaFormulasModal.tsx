import { useEffect } from "react";
import { createPortal } from "react-dom";
import "./TriggersRaFormulasModal.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

type MetricItem = { title: string; body: string };

const METRICS: MetricItem[] = [
  {
    title: "Обращений",
    body: "Число обращений оператора за выбранный период по всем проектам СП и VIP.",
  },
  {
    title: "Неконструктив, %",
    body: "Доля обращений с тематикой «Неконструктив» от общего числа обращений оператора.",
  },
  {
    title: "Негатив клиента, %",
    body: "Средний уровень негатива клиента (взвешенный) по голосовым звонкам — Входящие СП/VIP и ТМ. Звонки с 0% тоже учитываются. Значение из TouchPoint умножается на 100 для отображения в процентах.",
  },
  {
    title: "Завершил оператор, %",
    body: "Доля звонков, где разговор завершил оператор (EndCall = «Оператор» или OperatorEndCall = 1).",
  },
  {
    title: "Оценка ОКК, %",
    body: "Средняя оценка weight по обращениям на стадии «Проверено». Для отображения умножается на 100.",
  },
  {
    title: "В мониторинге, %",
    body: "Доля обращений, взятых на стадию «Взять в мониторинг».",
  },
  {
    title: "Риск выгорания (ИИ), эмпатия, вовлечённость",
    body: "Средние значения из JSON-промпта выгорания в form_items (шкала 0–100). Если оценок мало — показатель не показывается.",
  },
  {
    title: "Преждевременное завершение, %",
    body: "Доля обращений, где ИИ отметил premature_closure — преждевременное завершение разговора.",
  },
];

const SCORE_ROWS: Array<{ label: string; points: number }> = [
  { label: "Рост неконструктива СП (≥ 5 п.п.)", points: 25 },
  { label: "Рост неконструктива VIP (≥ 5 п.п.)", points: 15 },
  { label: "Рост негатива клиента (≥ 5 п.п.)", points: 15 },
  { label: "Чаще завершает оператор (≥ 5 п.п.)", points: 15 },
  { label: "Падение оценки ОКК (≥ 5 пунктов)", points: 10 },
  { label: "Несколько признаков поведения", points: 15 },
  { label: "Риск выгорания по ИИ", points: 5 },
];

export function TriggersRaFormulasModal(props: Props) {
  useEffect(() => {
    if (!props.open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") props.onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  return createPortal(
    <div className="tra-formulas-backdrop" role="presentation" onClick={props.onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tra-formulas-title"
        className="tra-formulas-dialog scrollbar-pari"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tra-formulas-dialog__head">
          <div>
            <p className="tra-formulas-dialog__eyebrow">Тригеры РА</p>
            <h2 id="tra-formulas-title" className="tra-formulas-dialog__title">
              Как считаются столбцы
            </h2>
          </div>
          <button
            type="button"
            className="tra-formulas-dialog__close"
            onClick={props.onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>

        <div className="tra-formulas-dialog__body">
          <section className="tra-formulas-section">
            <h3 className="tra-formulas-section__title">Показатели в таблице</h3>
            <p className="tra-formulas-section__lead">
              Основные метрики оператора за выбранный период анализа.
            </p>
            <div className="tra-formulas-cards">
              {METRICS.map((item) => (
                <article key={item.title} className="tra-formulas-card">
                  <h4 className="tra-formulas-card__title">{item.title}</h4>
                  <p className="tra-formulas-card__text">{item.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="tra-formulas-section">
            <h3 className="tra-formulas-section__title">Динамика (Δ)</h3>
            <p className="tra-formulas-section__lead">
              Сравнение с предыдущим периодом той же длины. «п.п.» — процентные пункты.
            </p>
            <div className="tra-formulas-legend">
              <div className="tra-formulas-legend__item tra-formulas-legend__item--bad">
                <span className="tra-formulas-legend__symbol">↑</span>
                <div>
                  <strong>Рост</strong>
                  <p>Обычно ухудшение (красный)</p>
                </div>
              </div>
              <div className="tra-formulas-legend__item tra-formulas-legend__item--good">
                <span className="tra-formulas-legend__symbol">↓</span>
                <div>
                  <strong>Снижение</strong>
                  <p>Обычно улучшение (зелёный)</p>
                </div>
              </div>
              <div className="tra-formulas-legend__item">
                <span className="tra-formulas-legend__symbol">→ 0</span>
                <div>
                  <strong>Без изменений</strong>
                  <p>Нейтрально (серый)</p>
                </div>
              </div>
            </div>
            <p className="tra-formulas-note">
              Для оценки ОКК, эмпатии и вовлечённости логика обратная: рост — зелёный, падение — красный.
            </p>
          </section>

          <section className="tra-formulas-section">
            <h3 className="tra-formulas-section__title">Балл риска</h3>
            <p className="tra-formulas-section__lead">
              Сумма весов сработавших признаков. Максимум — 100 баллов.
            </p>
            <div className="tra-formulas-table-wrap">
              <table className="tra-formulas-table">
                <thead>
                  <tr>
                    <th>Признак</th>
                    <th className="tra-formulas-table__num">Баллы</th>
                  </tr>
                </thead>
                <tbody>
                  {SCORE_ROWS.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td className="tra-formulas-table__num">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tra-formulas-callout">
              <strong>Зона риска</strong>
              <p>
                Балл ≥ <span>51</span> или одновременно ≥ <span>2</span> срабатываний.
              </p>
            </div>
          </section>

          <section className="tra-formulas-section">
            <h3 className="tra-formulas-section__title">Срабатывания</h3>
            <p className="tra-formulas-section__lead">
              Список признаков, которые сработали в текущем периоде по сравнению с базой. В таблице они
              показаны простым языком, без кодов T1–T11.
            </p>
          </section>

          <section className="tra-formulas-section">
            <h3 className="tra-formulas-section__title">Пороги включения</h3>
            <ul className="tra-formulas-thresholds">
              <li>
                <span className="tra-formulas-thresholds__label">Рейтинг</span>
                <span className="tra-formulas-thresholds__value">≥ 10 обращений за период</span>
              </li>
              <li>
                <span className="tra-formulas-thresholds__label">ИИ-триггер</span>
                <span className="tra-formulas-thresholds__value">
                  ≥ 3 оценок; риск ≥ 61 или рост на 10 баллов
                </span>
              </li>
              <li>
                <span className="tra-formulas-thresholds__label">ОКК-триггер</span>
                <span className="tra-formulas-thresholds__value">≥ 5 проверок ОКК</span>
              </li>
            </ul>
          </section>
        </div>

        <footer className="tra-formulas-dialog__foot">
          <button type="button" className="tra-formulas-dialog__ok" onClick={props.onClose}>
            Понятно
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
