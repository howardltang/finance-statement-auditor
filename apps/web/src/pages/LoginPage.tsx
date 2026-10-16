import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../components/AuthShell";
import { CredentialsForm } from "../components/CredentialsForm";
import { useLogin } from "../lib/auth";
import { ApiError } from "../lib/api";

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to review your statements."
      footer={
        <>
          No account? <Link to="/register">Register</Link>
        </>
      }
    >
      <CredentialsForm
        submitLabel="Log in"
        pending={login.isPending}
        errorMessage={
          login.error instanceof ApiError && login.error.status === 401
            ? "Invalid email or password."
            : login.error
              ? "Something went wrong. Please try again."
              : null
        }
        onSubmit={(credentials) => login.mutate(credentials, { onSuccess: () => navigate("/") })}
      />
    </AuthShell>
  );
}
