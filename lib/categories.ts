// iptv-org tags channels with English category names regardless of the
// channel's language, so we translate them for display only. Filtering still
// matches against the raw `channel.group` value.
const TRANSLATIONS: Record<string, string> = {
  undefined: "Sin categoría",
  animation: "Animación",
  auto: "Autos",
  business: "Negocios",
  classic: "Clásicos",
  comedy: "Comedia",
  cooking: "Cocina",
  culture: "Cultura",
  documentary: "Documentales",
  education: "Educación",
  entertainment: "Entretenimiento",
  family: "Familiar",
  general: "General",
  kids: "Infantil",
  legislative: "Legislativo",
  lifestyle: "Estilo de vida",
  local: "Local",
  movies: "Películas",
  music: "Música",
  national: "Nacional",
  news: "Noticias",
  outdoor: "Aire libre",
  public: "Público",
  regional: "Regional",
  relax: "Relax",
  religious: "Religioso",
  science: "Ciencia",
  series: "Series",
  shop: "Compras",
  sports: "Deportes",
  travel: "Viajes",
  weather: "Clima",
  xxx: "Adultos",
};

export function translateGroup(raw: string): string {
  if (!raw) return "Sin categoría";
  return raw
    .split(";")
    .map((part) => TRANSLATIONS[part.trim().toLowerCase()] || part.trim())
    .join(" · ");
}
