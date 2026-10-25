import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { PasswordForm, ProfileForm } from "@/components/profile-forms";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id }, include: { department: { select: { name: true } } } });
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];
  return (
    <>
      <PageHeader title="Profile & security" description={full.lastLoginAt ? `Last sign-in ${fmtDateTime(full.lastLoginAt)}` : undefined} />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3"><CardHeader title="Your profile" /><CardBody><ProfileForm user={{ name: full.name, phone: full.phone, timezone: full.timezone, skills: full.skills, avatarUrl: full.avatarUrl }} zones={zones} readOnly={{ email: full.email, role: ROLE_LABEL[user.role], department: full.department?.name ?? "—" }} /></CardBody></Card>
        <Card className="h-fit lg:col-span-2"><CardHeader title="Change password" /><CardBody><PasswordForm /></CardBody></Card>
      </div>
    </>
  );
}
