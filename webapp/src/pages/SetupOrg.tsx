import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OrdoStageLogo } from "@/components/OrdoStageLogo";

export default function SetupOrg() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/api/org", { name });
      navigate("/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create organization";
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <OrdoStageLogo size={88} />
          </div>
          <h1 className="text-3xl font-bold text-white">Welcome!</h1>
          <p className="text-gray-400 mt-2">
            Create an additional workspace, or finish setup if you signed in with GitHub before naming your organization.
          </p>
        </div>
        <div className="bg-gray-900 border border-white/10 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-1">Name your organization</h2>
          <p className="text-gray-400 text-sm mb-6">This is the name your team will see</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              placeholder="e.g. OrdoStage Theatre Group"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="bg-gray-800 border-white/20 text-white"
            />
            {error ? <p className="text-red-400 text-sm">{error}</p> : null}
            <Button type="submit" disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700">
              {loading ? "Creating..." : "Create Organization"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
