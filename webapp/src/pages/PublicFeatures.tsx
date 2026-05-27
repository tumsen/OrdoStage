import { Navigate } from "react-router-dom";

/** Legacy URL — marketing features live on the homepage (ordostage.com/#features). */
export default function PublicFeatures() {
  return <Navigate to={{ pathname: "/", hash: "#features" }} replace />;
}
