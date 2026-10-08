const BAMBUDDY_MATERIALS_API_URL = "http://localhost:8000/api/v1/spoolman/spools";

type BambuddyMaterial = {
  id: number;
  name: string;
  weightGrams: number;
  priceMMK: number;
  colorHex: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function GET() {
  const apiKey = process.env.BAMBUDDY_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        ok: false,
        error: "BAMBUDDY_API_KEY is not configured in the server environment.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetch(BAMBUDDY_MATERIALS_API_URL, {
      cache: "no-store",
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error.";

    return Response.json(
      {
        ok: false,
        error: `Unable to reach Bambuddy at ${BAMBUDDY_MATERIALS_API_URL}: ${message}`,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!upstreamResponse.ok) {
    return Response.json(
      { ok: false, error: `Bambuddy responded with HTTP ${upstreamResponse.status}.` },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const payload: unknown = await upstreamResponse.json();
    if (!isRecord(payload) || !Array.isArray(payload.spools)) {
      return Response.json(
        { ok: false, error: "Bambuddy returned an unexpected spool response." },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const materials: BambuddyMaterial[] = payload.spools.flatMap((value) => {
      if (!isRecord(value) || !isRecord(value.filament)) return [];

      const filament = value.filament;
      const weightGrams =
        typeof value.initial_weight === "number" && Number.isFinite(value.initial_weight)
          ? value.initial_weight
          : typeof filament.weight === "number" && Number.isFinite(filament.weight)
            ? filament.weight
            : 0;
      const priceMMK = value.price;
      const name = filament.name;
      const colorHex = filament.color_hex;

      if (
        typeof value.id !== "number" ||
        !Number.isFinite(value.id) ||
        typeof name !== "string" ||
        typeof priceMMK !== "number" ||
        !Number.isFinite(priceMMK) ||
        priceMMK < 0 ||
        weightGrams <= 0
      ) {
        return [];
      }

      return [{
        id: value.id,
        name,
        weightGrams,
        priceMMK,
        colorHex:
          typeof colorHex === "string" && /^#?[0-9a-fA-F]{6}$/.test(colorHex)
            ? colorHex.startsWith("#") ? colorHex : `#${colorHex}`
            : "#CBD5E1",
      }];
    });

    return Response.json(
      { ok: true, materials },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON response.";

    return Response.json(
      { ok: false, error: `Bambuddy returned invalid JSON: ${message}` },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
