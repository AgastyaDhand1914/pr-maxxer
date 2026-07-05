const BASE_URL = import.meta.env.VITE_BACKEND_URL;

async function fetchWithAuth(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BASE_URL}${url}`, {
      ...options,
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (response.status === 401 && window.location.pathname !== "/") {
      window.location.href = "/";
    }

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Auth
export async function getMe() {
  const res = await fetchWithAuth("/auth/me");
  if (!res.ok) throw new Error("Not authenticated");
  return res.json();
}

export async function logout() {
  const res = await fetchWithAuth("/auth/logout", { method: "POST" });
  if (!res.ok) throw new Error("Failed to logout");
  return res.json();
}

// Repos
export async function getUserRepos() {
  const res = await fetchWithAuth("/api/repos");
  if (!res.ok) throw new Error("Failed to fetch repos");
  return res.json();
}

export async function connectRepo(repoFullName) {
  const res = await fetchWithAuth("/api/repos", {
    method: "POST",
    body: JSON.stringify({ repo_full_name: repoFullName }),
  });
  if (!res.ok) throw new Error("Failed to connect repo");
  return res.json(); // returns token
}

export async function updateRepoConfig(repoId, config) {
  const res = await fetchWithAuth(`/api/repos/${repoId}/config`, {
    method: "PUT",
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("Failed to update config");
  return res.json();
}

export async function regenerateRepoToken(repoId) {
  const res = await fetchWithAuth(`/api/repos/${repoId}/regenerate-token`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Failed to regenerate token");
  return res.json();    //returns { repo_id, repo_full_name, backend_token }
}

export async function getGithubRepos() {
  const res = await fetchWithAuth("/api/github/repos");
  if (!res.ok) throw new Error("Failed to fetch github repos");
  return res.json();
}

// Reviews
export async function getReviews(page = 1, limit = 20, repoId = null) {
  let url = `/api/reviews?page=${page}&limit=${limit}`;
  if (repoId) {
    url += `&repoId=${repoId}`;
  }
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error("Failed to fetch reviews");
  return res.json();
}

export async function getReviewById(id) {
  const res = await fetchWithAuth(`/api/reviews/${id}`);
  if (!res.ok) throw new Error("Failed to fetch review");
  return res.json();
}
