"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";

const allowedExtensions = ["stl", "obj", "step", "stp"];

export default function CustomPrintPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [material, setMaterial] = useState("PLA");
  const [color, setColor] = useState("Black");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedPath, setUploadedPath] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [error, setError] = useState("");

  async function handleUpload() {
    if (!file) {
      setError("Please select a 3D file first.");
      return;
    }

    if (!supabase) {
      setError("Supabase is not configured yet. Add your environment variables to enable uploads.");
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !allowedExtensions.includes(extension)) {
      setError("Only .stl, .obj, .step, and .stp files are allowed.");
      return;
    }

    try {
      setUploading(true);
      setError("");

      const sanitizedName = file.name.replace(/\s+/g, "-");
      const path = `custom-prints/${Date.now()}-${sanitizedName}`;

      const { data, error: uploadError } = await supabase.storage
        .from("secure-3d-files")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });

      if (uploadError) throw uploadError;

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("secure-3d-files")
        .createSignedUrl(data.path, 60 * 60);

      if (signedUrlError) throw signedUrlError;

      setUploadedPath(data.path);
      setUploadedUrl(signedUrlData.signedUrl);
    } catch (err: any) {
      setError(err.message || "Upload failed");
      setUploadedPath("");
      setUploadedUrl("");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Custom print on demand
        </p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">Request a custom 3D print</h1>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="rounded-md border border-slate-200 px-3 py-2 outline-none"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="rounded-md border border-slate-200 px-3 py-2 outline-none"
          />
          <select
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            className="rounded-md border border-slate-200 px-3 py-2 outline-none"
          >
            <option value="PLA">PLA</option>
            <option value="PETG">PETG</option>
            <option value="ABS">ABS</option>
            <option value="TPU">TPU</option>
          </select>
          <select
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="rounded-md border border-slate-200 px-3 py-2 outline-none"
          >
            <option value="Black">Black</option>
            <option value="White">White</option>
            <option value="Blue">Blue</option>
            <option value="Red">Red</option>
          </select>
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-sm font-medium text-slate-700">Upload 3D model</label>
          <input
            type="file"
            accept=".stl,.obj,.step,.stp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-sm"
          />
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Project notes, dimensions, or special instructions"
          className="mt-5 min-h-32 w-full rounded-md border border-slate-200 px-3 py-2 outline-none"
        />

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {uploadedUrl ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            <p className="font-medium">Secure upload complete.</p>
            <p className="mt-1 break-all">Stored path: {uploadedPath}</p>
          </div>
        ) : null}

        <div className="mt-6 flex gap-3">
          <Button onClick={handleUpload} disabled={uploading}>
            {uploading ? "Uploading..." : "Upload model"}
          </Button>
          <Button variant="outline">Request quote</Button>
        </div>
      </div>
    </main>
  );
}
