/** Attribution, and an honest statement of what this data is and is not.

No name, no personal links: a shared app should not point back at a person.
*/

interface Props {
  generated: string;
}

export function Footer({ generated }: Props) {
  return (
    <footer className="footer">
      <p>
        Prijzen van <a href="https://dats24.be" target="_blank" rel="noreferrer">DATS 24</a>,
        zoals zij die zelf publiceren. Officiele maximumprijs van de FOD Economie, meegeleverd
        bij diezelfde prijzen. Kaart van{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>
        , onder ODbL.
      </p>
      <p>
        Alleen DATS 24 stations. Andere merken publiceren hun pompprijzen niet, dus die staan
        hier niet in. Prijzen zijn ter informatie: wat aan de pomp hangt, telt.
      </p>
      <p className="footer-meta">
        Onafhankelijk hobbyproject, niet verbonden aan DATS 24. Laatste update:{" "}
        {formatMoment(generated)}.
      </p>
    </footer>
  );
}

function formatMoment(iso: string): string {
  const stamp = Date.parse(iso);
  if (Number.isNaN(stamp)) return "onbekend";
  return new Date(stamp).toLocaleString("nl-BE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
