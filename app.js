import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ====== ADD YOUR SUPABASE PROJECT DETAILS HERE ======
const SUPABASE_URL = "https://ratvocmoyqwietodqdef.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Z5PDPxzqmSB4KUuTfmkpFA_udMH-dJT";
// ====================================================

const configured = !SUPABASE_URL.startsWith("YOUR_") && !SUPABASE_PUBLISHABLE_KEY.startsWith("YOUR_");
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;

const $ = (id) => document.getElementById(id);
const money = (n) => `₹${Number(n || 0).toFixed(2)}`;
const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", {day:"2-digit",month:"short",year:"numeric"});
const fmtUpdated = (iso) => new Date(iso).toLocaleString("en-IN", {day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});

let currentRole = null;
let cachedTrips = [];

function show(el, yes=true){ el.classList.toggle("hidden", !yes); }

async function getProfile(userId){
  const { data, error } = await supabase.from("profiles").select("role, display_name").eq("id", userId).single();
  if(error) throw error;
  return data;
}

async function loadDashboard(){
  const { data: { user } } = await supabase.auth.getUser();
  if(!user) return;

  const profile = await getProfile(user.id);
  currentRole = profile.role;
  show($("loginView"), false);
  show($("appView"), true);
  show($("adminPanel"), currentRole === "owner");
  show($("exportBtn"), currentRole === "owner");
  show($("logoutBtn"), true);
  await loadTrips();
}

async function loadTrips(){
  $("historyBody").innerHTML = `<tr><td colspan="7" class="muted">Loading…</td></tr>`;
  const { data, error } = await supabase
    .from("trips")
    .select("trip_date, trip_time, status, station, fare, balance_after, note, created_at")
    .order("trip_date", {ascending:false})
    .order("trip_time", {ascending:false})
    .order("created_at", {ascending:false});

  if(error){ $("historyBody").innerHTML = `<tr><td colspan="7">Could not load trips: ${escapeHtml(error.message)}</td></tr>`; return; }
  cachedTrips = data || [];
  renderTrips();
}

function renderTrips(){
  if(!cachedTrips.length){
    $("historyBody").innerHTML = `<tr><td colspan="7" class="muted">No trips yet.</td></tr>`;
    $("latestStatus").textContent = "No update";
    $("latestStation").textContent = "—";
    $("cardBalance").textContent = "—";
    $("lastUpdated").textContent = "—";
    return;
  }
  const latest = cachedTrips[0];
  $("latestStatus").textContent = latest.status;
  $("latestStation").textContent = latest.station;
  $("cardBalance").textContent = money(latest.balance_after);
  $("lastUpdated").textContent = fmtUpdated(latest.created_at);

  $("historyBody").innerHTML = cachedTrips.map(t => `
    <tr>
      <td>${fmtDate(t.trip_date)}</td>
      <td>${escapeHtml(t.trip_time.slice(0,5))}</td>
      <td>${escapeHtml(t.status)}</td>
      <td>${escapeHtml(t.station)}</td>
      <td>${money(t.fare)}</td>
      <td>${money(t.balance_after)}</td>
      <td>${escapeHtml(t.note || "")}</td>
    </tr>`).join("");
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

$("tripDate").value = new Date().toISOString().slice(0,10);
$("tripTime").value = new Date().toTimeString().slice(0,5);

$("loginForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  if(!configured) return;
  $("loginMsg").textContent = "Signing in…";
  const { error } = await supabase.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("password").value
  });
  $("loginMsg").textContent = error ? error.message : "";
});

$("tripForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  if(currentRole !== "owner") return;
  $("saveMsg").textContent = "Saving…";
  const { data: { user } } = await supabase.auth.getUser();

  const payload = {
    owner_id: user.id,
    trip_date: $("tripDate").value,
    trip_time: $("tripTime").value,
    status: $("tripStatus").value,
    station: $("station").value.trim(),
    fare: Number($("fare").value || 0),
    balance_after: Number($("balance").value),
    note: $("note").value.trim()
  };

  const { error } = await supabase.from("trips").insert(payload);
  if(error){ $("saveMsg").textContent = error.message; return; }
  $("saveMsg").textContent = "Saved.";
  $("note").value = "";
  await loadTrips();
});

$("refreshBtn").addEventListener("click", loadTrips);

$("logoutBtn").addEventListener("click", async ()=>{
  await supabase.auth.signOut();
  location.reload();
});

$("exportBtn").addEventListener("click", ()=>{
  const header = ["Date","Time","Status","Station","Fare","Balance","Note"];
  const rows = cachedTrips.map(t => [t.trip_date,t.trip_time,t.status,t.station,t.fare,t.balance_after,t.note||""]);
  const csv = [header, ...rows].map(row => row.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "metro-travel-history.csv"; a.click();
  URL.revokeObjectURL(url);
});

(async function init(){
  if(!configured){
    show($("setupNotice"), true);
    return;
  }
  show($("setupNotice"), false);
  const { data: { session } } = await supabase.auth.getSession();
  if(session) await loadDashboard();
  else show($("loginView"), true);

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if(session) await loadDashboard();
  });
})();
