import { Link } from "react-router-dom";
import data from "../landing-v7.json";

type Img = { w: number; h: number };
const IM = data.images as Record<string, Img>;
/** A real generated image from the v7 engine, with its true dimensions so the page never shifts. */
function Shot({
  name,
  alt,
  eager = false,
  className,
}: {
  name: string;
  alt: string;
  eager?: boolean;
  className?: string;
}) {
  const d = IM[name]!;
  return (
    <img
      className={className}
      src={`/v7/${name}.webp`}
      width={d.w}
      height={d.h}
      alt={alt}
      {...(eager
        ? { fetchPriority: "high" as const }
        : { loading: "lazy" as const, decoding: "async" as const })}
    />
  );
}

/** Hero visual: the actual output Kora produced for one small bakery, three ways, at once. No mock-ups. */
export function HeroCollage() {
  return (
    <figure
      className="v7-collage"
      aria-label="A website, a story and a flyer Kora made for one bakery"
    >
      <div className="v7-collage-site">
        <Shot
          name="bakery-d0"
          eager
          alt="Website Kora generated for a home bakery: arched cake photograph, italic serif headline, an Order on WhatsApp button"
        />
      </div>
      <div className="v7-collage-phone">
        <Shot name="bakery-m" eager alt="The same bakery website on a phone" />
      </div>
      <div className="v7-collage-story">
        <Shot name="bakery-story" alt="The matching Instagram story" />
      </div>
      <figcaption className="small muted">
        Real output for one fictional bakery, from two sentences and a WhatsApp
        number.
      </figcaption>
    </figure>
  );
}

/** The whole transformation on one real business: brief -> understanding -> directions -> brand -> site -> campaign. */
export function Transformation() {
  const b = data.brief;
  return (
    <section className="v7-story" id="transformation" aria-labelledby="v7-h">
      <div className="wrap">
        <p className="k-kicker">One business, start to finish</p>
        <h2 id="v7-h">From two sentences to a brand people recognise.</h2>
        <p className="lead v7-lead">
          This is a home bakery in Lagos. Everything below was made by Kora from
          what the owner wrote. Nothing is a mock-up.
        </p>

        <ol className="v7-steps">
          <li className="v7-step">
            <span className="v7-n">1</span>
            <div>
              <h3>The brief</h3>
              <blockquote className="v7-brief">
                “{b.description.replace(/\. I only have.*$/, ".")}”
              </blockquote>
              <p className="small muted">
                Plus a WhatsApp number and three things she sells:{" "}
                {b.services.join(", ").toLowerCase()}.
              </p>
            </div>
          </li>

          <li className="v7-step">
            <span className="v7-n">2</span>
            <div>
              <h3>Kora understands what is true</h3>
              <ul className="v7-facts">
                <li>
                  <b>Told by the owner</b> name, what she bakes, WhatsApp, area
                </li>
                <li>
                  <b>Worked out</b> people order cakes by message, so the main
                  button is Order on WhatsApp
                </li>
                <li>
                  <b>Still missing</b> prices, hours, reviews, photos. Kora
                  asks; it never invents them
                </li>
              </ul>
            </div>
          </li>

          <li className="v7-step">
            <span className="v7-n">3</span>
            <div>
              <h3>Three directions that are really different</h3>
              <p className="muted">
                Not three colour swaps: different type, composition and
                personality.
              </p>
              <ul className="v7-dirs">
                {data.directions.map((d, i) => (
                  <li key={d.name}>
                    <Shot
                      name={`bakery-d${i}`}
                      alt={`Direction ${i + 1}: ${d.name}`}
                    />
                    <p>
                      <strong>{d.name}</strong>
                      {d.recommended && (
                        <span className="v7-rec"> Kora's pick</span>
                      )}
                      <span className="small muted">{d.concept}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </li>

          <li className="v7-step">
            <span className="v7-n">4</span>
            <div>
              <h3>A brand, written down once</h3>
              <p className="muted">{data.directions[0]!.essence}.</p>
              <ul className="v7-brand" aria-label="Brand system">
                <li>
                  <span className="v7-sw">
                    {data.directions[0]!.swatches.map((c) => (
                      <i key={c} style={{ background: c }} title={c} />
                    ))}
                  </span>
                  <span className="small">Colour</span>
                </li>
                <li>
                  <b>{data.directions[0]!.typeface}</b>
                  <span className="small">Headlines</span>
                </li>
                <li>
                  <b>{data.directions[0]!.signature}</b>
                  <span className="small">Signature device</span>
                </li>
                <li>
                  <b>Never</b>
                  <span className="small">
                    {data.directions[0]!.avoids.join(" · ")}
                  </span>
                </li>
              </ul>
            </div>
          </li>

          <li className="v7-step">
            <span className="v7-n">5</span>
            <div>
              <h3>The website, then everything that matches it</h3>
              <div className="v7-set">
                <Shot name="bakery-m" alt="The bakery website on a phone" />
                <Shot
                  name="bakery-square"
                  alt="An Instagram post in the same brand"
                />
                <Shot
                  name="bakery-story"
                  alt="An Instagram or WhatsApp story in the same brand"
                />
                <Shot
                  name="bakery-flyer"
                  alt="A printable flyer in the same brand"
                />
              </div>
              <Shot
                className="v7-banner"
                name="bakery-banner"
                alt="A wide banner in the same brand"
              />
              <p className="small muted">
                Same colours, same type, same voice, each one laid out for its
                own shape. Cover the logo and you still know it is one brand.
              </p>
            </div>
          </li>

          <li className="v7-step">
            <span className="v7-n">6</span>
            <div>
              <h3>Then Kora keeps it working</h3>
              <p className="muted">
                The site is checked all day. If a release breaks it, Kora
                explains what happened in plain words, proposes the fix, waits
                for your approval, rolls back, and proves the recovery with
                fresh checks. Posts go out only after you approve the exact
                words.
              </p>
              <p>
                <Link className="btn" to="/signup">
                  Build mine
                </Link>
              </p>
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}

const WORK: Array<[string, string, string]> = [
  ["barber", "Neighbourhood barber", "Neighbourhood Energy"],
  ["law", "Commercial law firm", "Quiet Authority"],
  ["hotel", "Boutique hotel", "Arrival"],
  ["fashion", "Fashion boutique", "The Edit"],
  ["plumber", "Plumbing service", "Solid Ground"],
  ["saas", "Software for small shops", "Clear Signal"],
];

/** Six different businesses, six different brands, from the same engine. */
export function WorkShowcase() {
  return (
    <ul className="v7-work">
      {WORK.map(([id, label, dir]) => (
        <li key={id}>
          <Shot
            name={id}
            alt={`Website Kora generated for a ${label.toLowerCase()}`}
          />
          <span>
            {label} <em>· {dir}</em>
          </span>
        </li>
      ))}
    </ul>
  );
}

const PAIRS: Array<[string, string, string]> = [
  ["barber", "barber-v2", "Barbershop"],
  ["bakery-d0", "bakery-v2", "Home bakery"],
  ["law", "law-v2", "Law firm"],
];
/** The same brief through Kora's previous designer and through v7. Real renders of both. */
export function BeforeAfter() {
  return (
    <div className="v7-ba">
      {PAIRS.map(([after, before, label]) => (
        <div key={label} className="v7-ba-row">
          <figure>
            <Shot name={before} alt={`${label}: the previous Kora design`} />
            <figcaption className="small muted">Before</figcaption>
          </figure>
          <figure>
            <Shot name={after} alt={`${label}: the new Kora design`} />
            <figcaption className="small">
              <b>Now</b>
            </figcaption>
          </figure>
        </div>
      ))}
    </div>
  );
}
