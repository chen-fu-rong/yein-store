import Image from "next/image";

const prints = [
  {
    title: "3D Printed Lamp",
    image:
      "https://res.cloudinary.com/czgvcq9y/image/upload/v1791940486/lamp.jpg",
  },
];

export function Gallery() {
  return (
    <section aria-labelledby="gallery-heading" className="mb-12">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Made in our studio
        </p>
        <h2
          id="gallery-heading"
          className="mt-2 text-2xl font-bold text-slate-900"
        >
          Our Recent 3D Prints
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {prints.map((print) => (
          <article
            key={print.title}
            className="overflow-hidden rounded-xl bg-white shadow-md ring-1 ring-slate-200"
          >
            <div className="relative aspect-[4/3]">
              <Image
                src={print.image}
                alt={print.title}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover"
              />
            </div>
            <h3 className="px-4 py-3 text-base font-semibold text-slate-800">
              {print.title}
            </h3>
          </article>
        ))}
      </div>
    </section>
  );
}
