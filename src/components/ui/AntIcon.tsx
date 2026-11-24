import { antIcons } from "@/lib/ant-icons";
export function AntIcon({name,className="h-5 w-5",label}:{name:string;className?:string;label?:string}) {
  const icon=antIcons[name]||antIcons.appstore;
  return <svg viewBox={icon.viewBox} fill="currentColor" className={"inline-block shrink-0 align-middle "+className} role={label?"img":undefined} aria-label={label} aria-hidden={!label} focusable="false" dangerouslySetInnerHTML={{__html:icon.body}}/>;
}
