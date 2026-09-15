import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://ratvocmoyqwietodqdef.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Z5PDPxzqmSB4KUuTfmkpFA_udMH-dJT";
const configured = !SUPABASE_URL.startsWith("YOUR_") && !SUPABASE_PUBLISHABLE_KEY.startsWith("YOUR_");
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;
const $ = id => document.getElementById(id);
const money = n => `₹${Number(n || 0).toFixed(2)}`;
const fmtDate = d => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", {weekday:"short",day:"2-digit",month:"short",year:"numeric"});
const fmtTime = t => String(t || "").slice(0,5);
const fmtUpdated = iso => new Date(iso).toLocaleString("en-IN", {day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
const show = (el, yes=true) => el.classList.toggle("hidden", !yes);
const ROUTE_STATIONS = [
  ["Dwarka Mor","Blue Line"],["Nawada","Blue Line"],["Uttam Nagar West","Blue Line"],["Uttam Nagar East","Blue Line"],["Janak Puri West","Blue Line"],["Janak Puri East","Blue Line"],["Tilak Nagar","Blue Line"],["Subhash Nagar","Blue Line"],["Tagore Garden","Blue Line"],["Rajouri Garden","Blue Line"],["Ramesh Nagar","Blue Line"],["Moti Nagar","Blue Line"],["Kirti Nagar","Blue Line"],["Shadipur","Blue Line"],["Patel Nagar","Blue Line"],["Rajendra Place","Blue Line"],["Karol Bagh","Blue Line"],["Jhandewalan","Blue Line"],["R K Ashram Marg","Blue Line"],["Rajiv Chowk","Blue Line / Yellow Line"],["New Delhi","Yellow Line"],["Chawri Bazar","Yellow Line"],["Chandni Chowk","Yellow Line"],["Kashmere Gate","Yellow Line"],["Civil Lines","Yellow Line"],["Vidhan Sabha","Yellow Line"],["Vishwavidyalaya","Yellow Line"]
];
let currentRole=null, cachedTrips=[], lastSeenTripId=null;
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function buildRoute(){
  $("routeStations").innerHTML=ROUTE_STATIONS.map((s,i)=>`<div class="route-stop"><span class="route-num">${i+1}</span><span><strong>${escapeHtml(s[0])}</strong><small>${escapeHtml(s[1])}</small></span>${s[0]==="Rajiv Chowk"?'<em>CHANGE</em>':''}</div>`).join("");
  $("station").innerHTML='<option value="">Select station</option>'+ROUTE_STATIONS.map(s=>`<option value="${escapeHtml(s[0])}">${escapeHtml(s[0])} — ${escapeHtml(s[1])}</option>`).join("")+'<option value="Other">Other</option>';
}
async function getProfile(userId){const {data,error}=await supabase.from("profiles").select("role,display_name").eq("id",userId).single();if(error)throw error;return data;}
async function loadDashboard(initial=false){const {data:{user}}=await supabase.auth.getUser();if(!user)return;const profile=await getProfile(user.id);currentRole=profile.role;show($("loginView"),false);show($("appView"),true);show($("adminPanel"),currentRole==="owner");show($("exportBtn"),currentRole==="owner");show($("logoutBtn"),true);show($("parentNotifyBox"),currentRole==="parent");if(initial)lastSeenTripId=null;await loadTrips(!initial&&currentRole==="parent");}
async function loadTrips(notifyParent=false){
  const {data,error}=await supabase.from("trips").select("id,trip_date,trip_time,status,station,fare,balance_after,note,created_at").order("trip_date",{ascending:false}).order("trip_time",{ascending:false}).order("created_at",{ascending:false});
  if(error){$("historyGroups").innerHTML=`<p class="error">Could not load trips: ${escapeHtml(error.message)}</p>`;return;}
  cachedTrips=data||[];updateDateFilter();renderTrips();const newest=cachedTrips[0];
  if(notifyParent&&newest&&lastSeenTripId&&String(newest.id)!==String(lastSeenTripId)&&newest.status==="Reached Vishwavidyalaya") notifyParentAlert(newest);
  if(newest)lastSeenTripId=String(newest.id);
}
function updateDateFilter(){const sel=$("dateFilter"),current=sel.value,dates=[...new Set(cachedTrips.map(t=>t.trip_date))];sel.innerHTML='<option value="all">All dates</option>'+dates.map(d=>`<option value="${d}">${fmtDate(d)}</option>`).join("");sel.value=dates.includes(current)?current:"all";}
function renderTrips(){
  if(!cachedTrips.length){$("historyGroups").innerHTML='<p class="muted">No trips yet.</p>';$('latestStatus').textContent="No update";$('latestStation').textContent="—";$('cardBalance').textContent="—";$('lastUpdated').textContent="—";show($("collegeAlert"),false);return;}
  const latest=cachedTrips[0];$('latestStatus').textContent=latest.status;$('latestStation').textContent=latest.station;$('cardBalance').textContent=money(latest.balance_after);$('lastUpdated').textContent=fmtUpdated(latest.created_at);const reached=latest.status==="Reached Vishwavidyalaya"||latest.station==="Vishwavidyalaya";show($("collegeAlert"),reached);if(reached)$("collegeAlertText").textContent=` — ${fmtDate(latest.trip_date)} at ${fmtTime(latest.trip_time)}`;
  const selected=$("dateFilter").value,filtered=selected==="all"?cachedTrips:cachedTrips.filter(t=>t.trip_date===selected),groups={};filtered.forEach(t=>(groups[t.trip_date]??=[]).push(t));const dates=Object.keys(groups).sort().reverse();
  $("historyGroups").innerHTML=dates.map(date=>`<div class="date-group"><h3>${fmtDate(date)}</h3><div class="table-wrap"><table><thead><tr><th>Time</th><th>Status</th><th>Station</th><th>Fare</th><th>Balance</th><th>Note</th>${currentRole==="owner"?"<th>Action</th>":""}</tr></thead><tbody>${groups[date].map(t=>`<tr><td>${escapeHtml(fmtTime(t.trip_time))}</td><td>${escapeHtml(t.status)}</td><td>${escapeHtml(t.station)}</td><td>${money(t.fare)}</td><td>${money(t.balance_after)}</td><td>${escapeHtml(t.note||"")}</td>${currentRole==="owner"?`<td><button class="danger small delete-btn" data-id="${t.id}">Delete</button></td>`:""}</tr>`).join("")}</tbody></table></div></div>`).join("")||'<p class="muted">No updates for this date.</p>';
  document.querySelectorAll(".delete-btn").forEach(b=>b.addEventListener("click",()=>deleteTrip(b.dataset.id)));
}
async function deleteTrip(id){if(currentRole!=="owner"||!confirm("Delete this travel update? This cannot be undone."))return;const {error}=await supabase.from("trips").delete().eq("id",id);$("saveMsg").textContent=error?error.message:"Update deleted.";await loadTrips();}
function notifyParentAlert(trip){$("collegeAlertText").textContent=` — College reached at ${fmtTime(trip.trip_time)}.`;if("Notification"in window&&Notification.permission==="granted")new Notification("My Metro Journey",{body:`🎓 Vishwavidyalaya reached at ${fmtTime(trip.trip_time)}.`});}
$("enableNotifyBtn")?.addEventListener("click",async()=>{if(!("Notification"in window)){$("notifyMsg").textContent="This browser does not support browser alerts.";return;}const p=await Notification.requestPermission();$("notifyMsg").textContent=p==="granted"?"Browser alerts enabled.":"Permission not granted.";});
$("dateFilter").addEventListener("change",renderTrips);
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("loginMsg").textContent="Signing in…";const {error}=await supabase.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});$("loginMsg").textContent=error?error.message:"";});
$("tripForm").addEventListener("submit",async e=>{e.preventDefault();if(currentRole!=="owner")return;$("saveMsg").textContent="Saving…";const {data:{user}}=await supabase.auth.getUser();const payload={owner_id:user.id,trip_date:$("tripDate").value,trip_time:$("tripTime").value,status:$("tripStatus").value,station:$("station").value,fare:Number($("fare").value||0),balance_after:Number($("balance").value),note:$("note").value.trim()};const {error}=await supabase.from("trips").insert(payload);if(error){$("saveMsg").textContent=error.message;return;}$("saveMsg").textContent="Saved.";$("note").value="";await loadTrips();});
$("refreshBtn").addEventListener("click",()=>loadTrips());$("logoutBtn").addEventListener("click",async()=>{await supabase.auth.signOut();location.reload();});$("exportBtn").addEventListener("click",()=>{const rows=cachedTrips.map(t=>[t.trip_date,fmtTime(t.trip_time),t.status,t.station,t.fare,t.balance_after,t.note||""]);const csv=[["Date","Time","Status","Station","Fare","Balance","Note"],...rows].map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="metro-travel-history.csv";a.click();URL.revokeObjectURL(url);});
buildRoute();$("tripDate").value=new Date().toISOString().slice(0,10);$("tripTime").value=new Date().toTimeString().slice(0,5);
(async function init(){if(!configured){show($("setupNotice"),true);return;}show($("setupNotice"),false);const {data:{session}}=await supabase.auth.getSession();if(session){await loadDashboard(true);setInterval(()=>loadDashboard(false),15000);}else show($("loginView"),true);supabase.auth.onAuthStateChange(async(_event,s)=>{if(s)await loadDashboard(true);});})();