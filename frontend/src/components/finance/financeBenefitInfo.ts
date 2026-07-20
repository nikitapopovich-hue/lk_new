export type BenefitInfoKey = "english" | "best_benefits" | "benefit";

export type BenefitInfoPart = {
  text: string;
  href?: string;
};

export type BenefitInfoBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; parts: readonly BenefitInfoPart[] }
  | { type: "list"; items: readonly string[] };

export type BenefitInfo = {
  title: string;
  blocks: readonly BenefitInfoBlock[];
};

export const BENEFIT_INFO: Readonly<Record<BenefitInfoKey, BenefitInfo>> = {
  english: {
    title: "Английский язык",
    blocks: [
      { type: "heading", text: "Do you speak English?" },
      {
        type: "paragraph",
        parts: [{ text: "If not, тебе срочно нужно исправить это недоразумение." }],
      },
      {
        type: "paragraph",
        parts: [
          {
            text: "У нас есть корпоративная программа изучения английского языка совместно со ",
          },
          { text: "SkyEng", href: "https://skyeng.ru/" },
          {
            text: ", доступная после прохождения испытательного срока.",
          },
        ],
      },
      {
        type: "paragraph",
        parts: [
          {
            text: "На старте обучения мы дарим 4 бонусных урока, чтобы ты уверенно вошёл в процесс! А дальше компания оплачивает каждое второе занятие — фактически 50% обучения берём на себя.",
          },
        ],
      },
      {
        type: "paragraph",
        parts: [
          {
            text: "Все занятия проходят с русскоязычным преподавателем, так что никакого стресса — только комфортный и понятный английский, my friend!",
          },
        ],
      },
    ],
  },
  best_benefits: {
    title: "BestBenefits",
    blocks: [
      {
        type: "paragraph",
        parts: [
          {
            text: "Эксклюзивные скидки для сотрудников компании на товары, обучение, отдых, развлечения, медицину, спорт и многое другое.",
          },
        ],
      },
      { type: "heading", text: "Пример" },
      {
        type: "list",
        items: [
          "500 ₽ на заказ от 3000 ₽ в ВкусВилл.",
          "15% скидка в Тануки.",
          "20% скидка в Додо Пицца.",
          "10% дополнительная скидка в Золотом Яблоке.",
        ],
      },
      {
        type: "paragraph",
        parts: [{ text: "Доступно во всей России и СНГ." }],
      },
      {
        type: "paragraph",
        parts: [
          { text: "Скачивайте приложение и пользуйтесь бонусами! " },
          {
            text: "Инструкция.",
            href: "https://drive.google.com/file/d/18Rp0uA29O4xsQO7gvAbFxPpk-mj2ZEHB/view",
          },
        ],
      },
    ],
  },
  benefit: {
    title: "Бенефит",
    blocks: [
      {
        type: "paragraph",
        parts: [
          {
            text: "В PARI есть возможность получить компенсацию расходов, направленных на:",
          },
        ],
      },
      { type: "heading", text: "Спорт и здоровье" },
      {
        type: "paragraph",
        parts: [
          {
            text: "Покупка карты в фитнес-клуб, оплата тренировок, скипасс, участие в спортивных марафонах, оплата оздоровительных процедур: массаж, услуги психолога, медицинские услуги (кроме косметологии, эстетической хирургии, покупки медикаментов и прочих товаров).",
          },
        ],
      },
      { type: "heading", text: "Увлечения и хобби" },
      {
        type: "paragraph",
        parts: [
          {
            text: "Курсы, живопись, танцы, гончарное мастерство, обучение игре на музыкальных инструментах и т.п.",
          },
        ],
      },
      {
        type: "paragraph",
        parts: [
          {
            text: "Покупка билетов на матч любимой спортивной команды за счёт работодателя — 1 раз в квартал до 2000 ₽.",
          },
        ],
      },
      {
        type: "paragraph",
        parts: [
          { text: "Если есть сомнения насчёт компенсации — уточните в соответствующем боте " },
          { text: "@benefitparibot", href: "https://t.me/benefitparibot" },
          { text: "." },
        ],
      },
    ],
  },
};

export function hasBenefitInfo(infoKey?: BenefitInfoKey): boolean {
  return Boolean(infoKey && BENEFIT_INFO[infoKey]);
}
