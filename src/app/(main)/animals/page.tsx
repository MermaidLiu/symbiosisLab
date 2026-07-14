import { redirect } from "next/navigation";

export default function AnimalsIndexPage() {
  redirect("/animals/managed");
}
