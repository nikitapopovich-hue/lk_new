import type { BenefitInfoKey } from "./financeBenefitInfo";

export type GradeBenefit = {
  label: string;
  href?: string;
  infoKey?: BenefitInfoKey;
};

export type GradeLevel = {
  id: string;
  label: string;
  benefits: readonly GradeBenefit[];
  /** Пройденный грейд — только просмотр */
  passed?: boolean;
  /** Следующий грейд — просмотр с замком */
  locked?: boolean;
};

export const OPERATOR_CURRENT_GRADE = "5.1";

const YANDEX_BENEFIT = "Яндекс+ (компенсация до 700 ₽ раз в квартал)";

export const OPERATOR_GRADE_LEVELS: readonly GradeLevel[] = [
  {
    id: "4.4",
    label: "4.4",
    passed: true,
    benefits: [
      { label: "Страхование жизни" },
      { label: "Бенефит 10 000 ₽", infoKey: "benefit" },
      { label: "BestBenefits", href: "https://bestbenefits.ru/", infoKey: "best_benefits" },
      { label: "Английский язык", infoKey: "english" },
      { label: YANDEX_BENEFIT },
    ],
  },
  {
    id: "5.1",
    label: "5.1",
    benefits: [
      { label: "Английский язык", infoKey: "english" },
      { label: "Страхование жизни" },
      { label: "Бенефит 11 000 ₽", infoKey: "benefit" },
      { label: YANDEX_BENEFIT },
      { label: "BestBenefits", href: "https://bestbenefits.ru/", infoKey: "best_benefits" },
    ],
  },
  {
    id: "5.2",
    label: "5.2",
    locked: true,
    benefits: [
      { label: "Английский язык", infoKey: "english" },
      { label: "Страхование жизни" },
      { label: "Подключение к ДМС" },
      { label: "Бенефит 12 000 ₽", infoKey: "benefit" },
      { label: YANDEX_BENEFIT },
      { label: "BestBenefits", href: "https://bestbenefits.ru/", infoKey: "best_benefits" },
    ],
  },
] as const;

/** Условия перехода и доп. информация по грейду (ключ = id грейда в карусели). */
export type GradeTransitionSection = {
  title: string;
  items: readonly string[];
};

export const GRADE_TRANSITION_INFO: Readonly<Record<string, readonly GradeTransitionSection[]>> = {
  "4.4": [
    {
      title: "Рекомендованные условия перехода",
      items: [
        "Уверенное выполнение задач грейда 4.3, соответствующих целям команды.",
        "Регулярная сдача проверочных тестов на 75% и выше.",
        "Развитие профессиональных навыков и выполнение базовых KPI, поддерживающих цели направления.",
        "Активное участие в жизни команды: помощь новичкам, поддержка коллег.",
        "Предложение и реализация 1–2 идей, которые положительно влияют на бизнес-процессы направления или компании.",
        "Обучение на линию 2.1 (для СП).",
      ],
    },
    {
      title: "Встреча (проводит СВ/РК группы/отдела)",
      items: [
        "Промежуточную встречу назначаете индивидуально.",
        "Отчётная встреча — минимум через 4 месяца после предшествующей.",
      ],
    },
  ],
  "5.1": [
    {
      title: "Рекомендованные условия перехода",
      items: [
        "Уверенное владение навыками предыдущих грейдов.",
        "Успешная сдача допуска на 2-ю линию (для СП).",
        "Стабильные показатели мониторинга на хорошем уровне.",
        "Активное участие в жизни команды: помощь коллегам и взаимодействие с командой.",
        "Изучение Excel и выполнение индивидуального задания по отчётности, предоставленного руководителем.",
      ],
    },
  ],
  "5.2": [
    {
      title: "Рекомендованные условия перехода",
      items: [
        "Уверенное владение навыками предыдущих грейдов.",
        "Прохождение обучения и демонстрация навыков руководителю: наставничество, подача обратной связи.",
        "Обучение и поддержка менее опытных коллег.",
        "Предложение и реализация идеи по оптимизации бизнес-процессов группы или компании либо выполнение задания от руководителя.",
        "Навыки самоконтроля и контроля группы для успешного выполнения показателей команды.",
      ],
    },
  ],
};

export function getOperatorCurrentGradeIndex(): number {
  const idx = OPERATOR_GRADE_LEVELS.findIndex((level) => level.id === OPERATOR_CURRENT_GRADE);
  return idx >= 0 ? idx : 0;
}

export function hasGradeTransitionConditions(gradeId: string): boolean {
  const sections = GRADE_TRANSITION_INFO[gradeId];
  return Boolean(sections?.some((section) => section.items.length > 0));
}
