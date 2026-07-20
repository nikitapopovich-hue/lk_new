/** Корпоративные акценты PARI для плиток «Данные КЦ». */
export const KC_CHROMA_PALETTE = [
  {
    borderColor: "#00c7b1",
    gradient:
      "linear-gradient(145deg, rgba(0,199,177,0.28) 0%, rgba(6,11,38,0.92) 48%, rgba(2,5,21,1) 100%)",
  },
  {
    borderColor: "#753bbd",
    gradient:
      "linear-gradient(210deg, rgba(117,59,189,0.32) 0%, rgba(26,31,55,0.9) 50%, rgba(2,5,21,1) 100%)",
  },
  {
    borderColor: "#34d9c8",
    gradient:
      "linear-gradient(165deg, rgba(52,217,200,0.22) 0%, rgba(9,13,46,0.94) 52%, rgba(2,5,21,1) 100%)",
  },
  {
    borderColor: "#9b6fd4",
    gradient:
      "linear-gradient(195deg, rgba(155,111,212,0.26) 0%, rgba(6,11,38,0.9) 50%, rgba(2,5,21,1) 100%)",
  },
  {
    borderColor: "#00a896",
    gradient:
      "linear-gradient(135deg, rgba(0,168,150,0.3) 0%, rgba(26,31,55,0.88) 55%, rgba(2,5,21,1) 100%)",
  },
  {
    borderColor: "#5c2d99",
    gradient:
      "linear-gradient(225deg, rgba(92,45,153,0.28) 0%, rgba(6,11,38,0.92) 50%, rgba(2,5,21,1) 100%)",
  },
] as const;

export function kcChromaStyle(index: number) {
  return KC_CHROMA_PALETTE[index % KC_CHROMA_PALETTE.length];
}
