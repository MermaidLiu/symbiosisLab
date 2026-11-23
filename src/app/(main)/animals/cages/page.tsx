import { CageManagement } from "@/components/animals/CageManagement";
import { CageWorkflow } from "@/components/animals/CageWorkflow";

export default function CagesPage() {
  return <div className="space-y-4 overflow-auto p-4"><CageWorkflow /><details><summary>原有笼位信息</summary><CageManagement /></details></div>;
}
