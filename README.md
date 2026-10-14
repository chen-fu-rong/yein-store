This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Ready-made inventory

The live storefront is available at `/store`; administrators manage products and sell them from `/pos`. The `products` table must contain `id` (UUID), `name` (text), `description` (text), `price` (numeric), `stock` (integer), and `image_url` (text). Product image URLs must use HTTPS on `res.cloudinary.com`.

Before using the inventory, run [`supabase/migrations/202610140001_ready_made_inventory.sql`](./supabase/migrations/202610140001_ready_made_inventory.sql) in the Supabase SQL Editor. It grants public read access for the storefront, restricts product changes and stock deduction to profiles whose role is `admin`, and creates the transactional `deduct_product_stock` RPC used at checkout. The application server also checks the signed-in user's `profiles.role` before serving POS inventory APIs.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
