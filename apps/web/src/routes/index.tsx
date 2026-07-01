import type { ComponentType } from "react";
import type { ViewKey } from "../client/navigation";
import { Home } from "./Home";
import { ProductPage } from "./ProductPage";
import { OwnerVerify } from "./OwnerVerify";
import { OwnerDashboard } from "./OwnerDashboard";
import { Admin } from "./Admin";

/**
 * Route registry for the v0 web prototype. Keys align with the navigation `ViewKey` and the
 * core routes in docs/09 section 5. The prototype uses in-app navigation (see AppStore);
 * the Next.js target maps these to file-based routes.
 */

export interface RouteDef {
  label: string;
  component: ComponentType;
}

export const ROUTES: Record<ViewKey, RouteDef> = {
  home: { label: "Home", component: Home },
  product: { label: "Product", component: ProductPage },
  ownerVerify: { label: "Verify", component: OwnerVerify },
  ownerDashboard: { label: "Dashboard", component: OwnerDashboard },
  admin: { label: "Admin", component: Admin },
};

export type RouteKey = ViewKey;
