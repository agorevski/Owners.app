import type { ComponentType } from "react";

/**
 * Route registry for the v0 web shell.
 *
 * Mirrors the core routes in docs/09-mvp-implementation-spec.md section 5. These are
 * placeholder components; UI agents should replace them with real screens and adopt a
 * proper router (the Next.js target uses file-based routing).
 */

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <section>
      <h2>{title}</h2>
      <p style={{ color: "#555" }}>{description}</p>
      {/* TODO(web-agent): implement this screen. */}
    </section>
  );
}

const Home = () => (
  <Placeholder title="Home" description="Product overview / waitlist / sign-in entry ( / )." />
);
const ProductPage = () => (
  <Placeholder
    title="Product Q&A"
    description="Public product Q&A page ( /products/[canonicalProductId] )."
  />
);
const OwnerVerify = () => (
  <Placeholder
    title="Owner verification"
    description="Verification instructions and claim status ( /owner/verify )."
  />
);
const OwnerDashboard = () => (
  <Placeholder
    title="Owner dashboard"
    description="Questions answered, helpfulness, verified products ( /owner/dashboard )."
  />
);
const Admin = () => (
  <Placeholder
    title="Admin"
    description="Merges, verification review, moderation, metrics ( /admin/* )."
  />
);

export interface RouteDef {
  label: string;
  component: ComponentType;
}

export const ROUTES = {
  home: { label: "Home", component: Home },
  product: { label: "Product", component: ProductPage },
  ownerVerify: { label: "Verify", component: OwnerVerify },
  ownerDashboard: { label: "Dashboard", component: OwnerDashboard },
  admin: { label: "Admin", component: Admin },
} satisfies Record<string, RouteDef>;

export type RouteKey = keyof typeof ROUTES;
