export const kcFieldInputClass =
  "mt-1 w-full rounded-xl border border-white/[0.1] bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-pari-500/55 focus:ring-2 focus:ring-inset focus:ring-pari-500/25";

export const kcFieldDropdownClass =
  "absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-white/10 bg-[#0a1028] py-1 shadow-lg";

export const kcFieldDropdownItemClass = (active: boolean) =>
  `w-full px-3 py-2 text-left text-sm ${
    active ? "bg-pari-500/25 text-white" : "text-white/85 hover:bg-white/10"
  }`;
