import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../components/AuthShell";
import { CredentialsForm } from "../components/CredentialsForm";
import { useRegister } from "../lib/auth";
import { ApiError } from "../lib/api";

export default function RegisterPage() {
  const navigate = useNavigate();
  const register = useRegister();

  return (
    <AuthShell
      title="Create an account"
      subtitle="Start tracking your spending in minutes."
      footer={
        <>
          Already have an account? <Link to="/login">Log in</Link>
        </>
      }
    >
      <CredentialsForm
        submitLabel="Register"
        pending={register.isPending}
        errorMessage={
          register.error instanceof ApiError && register.error.status === 409
            ? "An account with that email already exists."
            : register.error
              ? "Something went wrong. Please try again."
              : null
        }
        onSubmit={(credentials) => register.mutate(credentials, { onSuccess: () => navigate("/") })}
      />
    </AuthShell>
  );
}
