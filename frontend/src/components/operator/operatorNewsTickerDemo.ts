/** Кому показывать новость — настройка в кабинете руководителя (позже). */
export type OperatorNewsAudience = "all" | "user" | "group";

export type OperatorNewsItem = {
  id: string;
  text: string;
  audience: OperatorNewsAudience;
  /** ID пользователей или групп — когда audience не all. */
  targetIds?: string[];
};

export const OPERATOR_NEWS_TICKER_DEMO: OperatorNewsItem[] = [
  {
    id: "usedesk",
    audience: "all",
    text: `Всем привет! Совсем скоро мы перейдём на обновлённый и современный функционал Usedesk. Прошу всех посмотреть тестовую учётку, а также материал с описанием и видео, чтобы в дальнейшем возникло меньше сложностей в работе. Подробнее: https://chat.google.com/room/AAAAzlYzBYY/JVYrsMipRR8/JVYrsMipRR8?cls=10`,
  },
  {
    id: "workplace",
    audience: "all",
    text: "Не забывай бронировать рабочее место!!!",
  },
];

/** Фильтр ленты для оператора (пока только audience: all). */
export function operatorNewsForViewer(
  items: OperatorNewsItem[],
  _opts?: { userId?: string; groupIds?: string[] },
): OperatorNewsItem[] {
  return items.filter((item) => {
    if (item.audience === "all") return true;
    // TODO: user / group при подключении кабинета руководителя
    return false;
  });
}
