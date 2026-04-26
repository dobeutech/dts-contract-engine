import { ClientForm } from "../client-form";
import { createClientAndRedirect } from "../actions";

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl">New client</h1>
      <ClientForm
        onSubmit={createClientAndRedirect}
        submitLabel="Create client"
      />
    </div>
  );
}
