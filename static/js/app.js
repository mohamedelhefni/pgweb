var appInfo = {};
var appFeatures = {};
var editor = null;
var contentViewEditor = null;
var contentEditEditor = null;
var connected = false;
var bookmarks = {};
var default_rows_limit = 100;
var currentObject = null;
var autocompleteObjects = [];
var finderObjects = [];
var inputResizing = false;
var inputResizeOffset = null;
var queryTabs = [];
var activeTabId = null;
var rowSidebarEditors = [];
var rowSidebarCtid = null;
var rowSidebarTable = null;
window.rowSidebarEditors = rowSidebarEditors;

var filterOptions = {
  equal: "= 'DATA'",
  not_equal: "!= 'DATA'",
  greater: "> 'DATA'",
  greater_eq: ">= 'DATA'",
  less: "< 'DATA'",
  less_eq: "<= 'DATA'",
  like: "LIKE 'DATA'",
  ilike: "ILIKE 'DATA'",
  null: "IS NULL",
  not_null: "IS NOT NULL",
};

function getSessionId() {
  var id = sessionStorage.getItem("session_id");

  if (!id) {
    id = guid();
    sessionStorage.setItem("session_id", id);
  }

  return id;
}

function setRowsLimit(num) {
  localStorage.setItem("rows_limit", num);
}

function getRowsLimit() {
  return parseInt(localStorage.getItem("rows_limit") || default_rows_limit);
}

function getPaginationOffset() {
  var page = $(".current-page").data("page");
  var limit = getRowsLimit();
  return (page - 1) * limit;
}

function getPagesCount(rowsCount) {
  var limit = getRowsLimit();
  var num = parseInt(rowsCount / limit);

  if (num * limit < rowsCount) {
    num++;
  }

  return num;
}

function apiCall(method, path, params, cb) {
  var timeout = appFeatures.query_timeout;
  if (timeout == null) {
    timeout = 300; // in seconds
  }

  $.ajax({
    timeout: timeout * 1000, // in milliseconds
    url: "api" + path,
    method: method,
    cache: false,
    data: params,
    headers: {
      "x-session-id": getSessionId(),
    },
    success: cb,
    error: function (xhr, status, data) {
      switch (status) {
        case "error":
          if (xhr.readyState == 0) {
            // 0 = UNSENT
            showErrorBanner(
              "Sorry, something went wrong with your request. Refresh the page and try again!",
            );
          }
          break;
        case "timeout":
          return cb({ error: "Query timeout after " + timeout + "s" });
      }

      var responseText;
      try {
        responseText = jQuery.parseJSON(xhr.responseText);
      } catch {
        responseText = { error: "Failed to parse the JSON response." };
      }
      cb(responseText);
    },
  });
}

function getInfo(cb) {
  apiCall("get", "/info", {}, cb);
}
function getConnection(cb) {
  apiCall("get", "/connection", {}, cb);
}
function getServerSettings(cb) {
  apiCall("get", "/server_settings", {}, cb);
}
function getSchemas(cb) {
  apiCall("get", "/schemas", {}, cb);
}
function getObjects(cb) {
  apiCall("get", "/objects", {}, cb);
}
function getTables(cb) {
  apiCall("get", "/tables", {}, cb);
}
function getTableRows(table, opts, cb) {
  apiCall("get", "/tables/" + table + "/rows", opts, cb);
}
function getTableStructure(table, opts, cb) {
  apiCall("get", "/tables/" + table, opts, cb);
}
function getTableIndexes(table, cb) {
  apiCall("get", "/tables/" + table + "/indexes", {}, cb);
}
function getTableConstraints(table, cb) {
  apiCall("get", "/tables/" + table + "/constraints", {}, cb);
}
function getTablesStats(cb) {
  apiCall("get", "/tables_stats", {}, cb);
}
function getFunction(id, cb) {
  apiCall("get", "/functions/" + id, {}, cb);
}
function getHistory(cb) {
  apiCall("get", "/history", {}, cb);
}
function getBookmarks(cb) {
  apiCall("get", "/bookmarks", {}, cb);
}
function executeQuery(query, cb) {
  apiCall("post", "/query", { query: query }, cb);
}
function explainQuery(query, cb) {
  apiCall("post", "/explain", { query: query }, cb);
}
function analyzeQuery(query, cb) {
  apiCall("post", "/analyze", { query: query }, cb);
}
function disconnect(cb) {
  apiCall("post", "/disconnect", {}, cb);
}

function insertTableRow(table, columns, values, cb) {
  $.ajax({
    url: "api/tables/" + table + "/rows",
    method: "post",
    contentType: "application/json",
    data: JSON.stringify({ columns: columns, values: values }),
    headers: { "x-session-id": getSessionId() },
    success: cb,
    error: function (xhr) {
      var r;
      try {
        r = JSON.parse(xhr.responseText);
      } catch (e) {
        r = { error: "Request failed" };
      }
      cb(r);
    },
  });
}

function encodeQuery(query) {
  return Base64.encode(query)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, ".");
}

function showErrorBanner(text) {
  if (window.errBannerTimeout != null) {
    clearTimeout(window.errBannerTimeout);
  }

  window.errBannerTimeout = setTimeout(function () {
    $("#error_banner").fadeOut("fast").text("");
  }, 3000);

  $("#error_banner").text(text).show();
}

function buildSchemaSection(name, objects) {
  var section = "";

  var titles = {
    table: "Tables",
    view: "Views",
    materialized_view: "Materialized Views",
    function: "Functions",
    sequence: "Sequences",
  };

  var icons = {
    table: '<i class="fa fa-table"></i>',
    view: '<i class="fa fa-table"></i>',
    materialized_view: '<i class="fa fa-table"></i>',
    function: '<i class="fa fa-bolt"></i>',
    sequence: '<i class="fa fa-circle-o"></i>',
  };

  var klass = "";
  if (name == "public") klass = "expanded";

  section += "<div class='schema " + klass + "'>";
  section +=
    "<div class='schema-name'><i class='fa fa-folder-o'></i><i class='fa fa-folder-open-o'></i> " +
    name +
    "</div>";
  section += "<div class='schema-container'>";

  ["table", "view", "materialized_view", "function", "sequence"].forEach(
    function (group) {
      group_klass = "";
      if (name == "public" && group == "table") group_klass = "expanded";

      section += "<div class='schema-group " + group_klass + "'>";
      section +=
        "<div class='schema-group-title'><i class='fa fa-chevron-right'></i><i class='fa fa-chevron-down'></i> " +
        titles[group] +
        " <span class='schema-group-count'>" +
        objects[group].length +
        "</span></div>";
      section += "<ul data-group='" + group + "'>";

      if (objects[group]) {
        objects[group].forEach(function (item) {
          var id = name + "." + item.name;

          // Use function OID since multiple functions with the same name might exist
          if (group == "function") {
            id = item.oid;
          }

          var expandable =
            group == "table" || group == "view" || group == "materialized_view";
          var toggleBtn = expandable
            ? "<span class='schema-item-toggle'><i class='fa fa-chevron-right'></i></span>"
            : "";
          var columnsUl = expandable
            ? "<ul class='schema-item-columns'></ul>"
            : "";
          var expandableClass = expandable ? " schema-item-expandable" : "";
          if (expandable) {
            section +=
              "<li class='schema-item schema-" +
              group +
              expandableClass +
              "' data-type='" +
              group +
              "' data-id='" +
              id +
              "' data-name='" +
              item.name +
              "'>" +
              "<div class='schema-item-row'>" +
              toggleBtn +
              icons[group] +
              "&nbsp;" +
              item.name +
              "</div>" +
              columnsUl +
              "</li>";
          } else {
            section +=
              "<li class='schema-item schema-" +
              group +
              "' data-type='" +
              group +
              "' data-id='" +
              id +
              "' data-name='" +
              item.name +
              "'>" +
              icons[group] +
              "&nbsp;" +
              item.name +
              "</li>";
          }
        });
        section += "</ul></div>";
      }
    },
  );

  section += "</div></div>";

  return section;
}

function loadLocalQueries() {
  if (!appFeatures.local_queries) return;

  $("body").on("click", "a.load-local-query", function (e) {
    var id = $(this).data("id");

    apiCall("get", "/local_queries/" + id, {}, function (resp) {
      editor.setValue(resp.query);
      editor.clearSelection();
    });
  });

  apiCall("get", "/local_queries", {}, function (resp) {
    if (resp.error) return;

    var container = $("#load-query-dropdown").find(".dropdown-menu");

    resp.forEach(function (item) {
      var title = item.title || item.id;
      $(
        "<li><a href='#' class='load-local-query' data-id='" +
          item.id +
          "'>" +
          title +
          "</a></li>",
      ).appendTo(container);
    });

    if (resp.length > 0) $("#load-local-query").prop("disabled", "");
    $("#load-query-dropdown").show();
  });
}

function loadSchemas() {
  $("#objects").html("");

  var emptyObjectList = function () {
    return {
      table: [],
      view: [],
      materialized_view: [],
      function: [],
      sequence: [],
    };
  };

  getSchemas(function (schemasData) {
    if (schemasData.error) {
      alert("Error while fetching schemas: " + schemasData.error);
      return;
    }

    getObjects(function (data) {
      if (data.error) {
        alert("Error while fetching database objects: " + data.error);
        return;
      }

      if (Object.keys(data).length == 0) {
        data["public"] = emptyObjectList();
      }

      for (schemaName of schemasData) {
        // Allow users to see empty schemas if we dont have any objects in them
        if (!data[schemaName]) {
          data[schemaName] = emptyObjectList();
        }

        $(buildSchemaSection(schemaName, data[schemaName])).appendTo(
          "#objects",
        );
      }

      if (Object.keys(data).length == 1) {
        $(".schema").addClass("expanded");
      }

      // Clear out all autocomplete objects
      autocompleteObjects = [];
      finderObjects = [];
      columnCache = {};
      for (schema in data) {
        for (kind in data[schema]) {
          if (
            !(
              kind == "table" ||
              kind == "view" ||
              kind == "materialized_view" ||
              kind == "function"
            )
          ) {
            continue;
          }

          for (item in data[schema][kind]) {
            var obj = data[schema][kind][item];
            autocompleteObjects.push({
              caption: obj.name,
              value: obj.name,
              meta: kind,
            });
            finderObjects.push({
              name: obj.name,
              schema: schema,
              type: kind,
              id:
                kind == "function" ? String(obj.oid) : schema + "." + obj.name,
            });
          }
        }
      }

      bindContextMenus();
    });
  });
}

function escapeHtml(str) {
  if (str != null || str != undefined) {
    return jQuery("<div/>").text(str).html();
  }

  return "<span class='null'>null</span>";
}

function unescapeHtml(str) {
  var e = document.createElement("div");
  e.innerHTML = str;
  return e.childNodes.length === 0 ? "" : e.childNodes[0].nodeValue;
}

var SAVED_CONNECTIONS_KEY = "pgweb_saved_connections";
var RECENT_CONNECTIONS_KEY = "pgweb_recent_connections";
var MAX_RECENT = 5;

function getSavedConnections() {
  try { return JSON.parse(localStorage.getItem(SAVED_CONNECTIONS_KEY) || "[]"); }
  catch(e) { return []; }
}

function getRecentConnections() {
  try { return JSON.parse(localStorage.getItem(RECENT_CONNECTIONS_KEY) || "[]"); }
  catch(e) { return []; }
}

function getFormConnectionData() {
  var mode = $(".connection-group-switch button.active").attr("data") || "standard";
  return {
    mode: mode,
    url: $.trim($("#connection_url").val()),
    host: $.trim($("#pg_host").val()),
    port: $.trim($("#pg_port").val()) || "5432",
    user: $.trim($("#pg_user").val()),
    password: $("#pg_password").val(),
    db: $.trim($("#pg_db").val()),
    ssl: $("#connection_ssl").val(),
    ssh_host: $.trim($("#ssh_host").val()),
    ssh_port: $.trim($("#ssh_port").val()),
    ssh_user: $.trim($("#ssh_user").val()),
    ssh_password: $("#ssh_password").val(),
    ssh_key: $.trim($("#ssh_key").val()),
    ssh_key_password: $("#ssh_key_password").val()
  };
}

function saveConnectionToStorage(name, data) {
  var list = getSavedConnections();
  list.unshift({ id: guid(), name: name, mode: data.mode, url: data.url,
    host: data.host, port: data.port, user: data.user, password: data.password,
    db: data.db, ssl: data.ssl, ssh_host: data.ssh_host, ssh_port: data.ssh_port,
    ssh_user: data.ssh_user, ssh_password: data.ssh_password,
    ssh_key: data.ssh_key, ssh_key_password: data.ssh_key_password,
    savedAt: new Date().toISOString() });
  localStorage.setItem(SAVED_CONNECTIONS_KEY, JSON.stringify(list));
}

function addRecentConnectionToStorage(data) {
  if (!data.host && !data.url) return;
  var key = data.host + "|" + data.port + "|" + data.user + "|" + data.db;
  var list = getRecentConnections().filter(function(c) {
    return (c.host + "|" + c.port + "|" + c.user + "|" + c.db) !== key;
  });
  list.unshift({ id: guid(), mode: data.mode, host: data.host, port: data.port,
    user: data.user, db: data.db, ssl: data.ssl, url: data.url,
    connectedAt: new Date().toISOString() });
  localStorage.setItem(RECENT_CONNECTIONS_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

function deleteSavedConnection(id) {
  localStorage.setItem(SAVED_CONNECTIONS_KEY,
    JSON.stringify(getSavedConnections().filter(function(c) { return c.id !== id; })));
}

function timeAgo(iso) {
  var d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60) return d + "s ago";
  if (d < 3600) return Math.floor(d / 60) + "m ago";
  if (d < 86400) return Math.floor(d / 3600) + "h ago";
  return Math.floor(d / 86400) + "d ago";
}

function setConnectionMode(mode) {
  $(".connection-group-switch button").removeClass("active");
  $(".connection-group-switch button[data='" + mode + "']").addClass("active");
  $(".connection-scheme-group").hide();
  $(".connection-standard-group").hide();
  $(".connection-ssh-group").hide();
  if (mode === "scheme") { $(".connection-scheme-group").show(); }
  else if (mode === "standard") { $(".connection-standard-group").show(); }
  else if (mode === "ssh") { $(".connection-standard-group").show(); $(".connection-ssh-group").show(); }
}

function renderSavedConnections() {
  var list = $("#saved_connections_list").empty();
  var conns = getSavedConnections();
  if (!conns.length) { list.html('<div class="conn-sidebar-empty">No saved connections</div>'); return; }
  conns.forEach(function(c) {
    var meta = c.mode === "scheme"
      ? (c.url || "").replace(/:[^:@]*@/, ":***@")
      : (c.user || "") + "@" + (c.host || "localhost") + "/" + (c.db || "");
    var el = $('<div class="conn-item" data-id="' + c.id + '">' +
      '<div class="conn-item-body">' +
        '<div class="conn-item-name">' + escapeHtml(c.name) + '</div>' +
        '<div class="conn-item-meta">' + escapeHtml(meta) + '</div>' +
      '</div>' +
      '<button type="button" class="conn-item-delete" data-id="' + c.id + '" title="Remove">&times;</button>' +
    '</div>');
    list.append(el);
  });
}

function renderRecentConnections() {
  var list = $("#recent_connections_list").empty();
  var conns = getRecentConnections();
  if (!conns.length) { list.html('<div class="conn-sidebar-empty">No recent connections</div>'); return; }
  conns.forEach(function(c) {
    var name = c.mode === "scheme"
      ? (c.url || "").replace(/:[^:@]*@/, ":***@").substring(0, 38)
      : (c.user || "") + "@" + (c.host || "localhost") + "/" + (c.db || "");
    var el = $('<div class="conn-item conn-item-recent" data-id="' + c.id + '">' +
      '<div class="conn-item-body">' +
        '<div class="conn-item-name">' + escapeHtml(name) + '</div>' +
        '<div class="conn-item-meta">' + timeAgo(c.connectedAt) + '</div>' +
      '</div>' +
    '</div>');
    list.append(el);
  });
}

function renderConnectionsSidebar() {
  renderSavedConnections();
  renderRecentConnections();
}

function loadSavedConnectionIntoForm(id) {
  var c = getSavedConnections().filter(function(x) { return x.id === id; })[0];
  if (!c) return;
  setConnectionMode(c.mode || "standard");
  $("#connection_url").val(c.url || "");
  $("#pg_host").val(c.host || "");
  $("#pg_port").val(c.port || "");
  $("#pg_user").val(c.user || "");
  $("#pg_password").val(c.password || "");
  $("#pg_db").val(c.db || "");
  $("#connection_ssl").val(c.ssl || "disable");
  $("#ssh_host").val(c.ssh_host || "");
  $("#ssh_port").val(c.ssh_port || "");
  $("#ssh_user").val(c.ssh_user || "");
  $("#ssh_password").val(c.ssh_password || "");
  $("#ssh_key").val(c.ssh_key || "");
  $("#ssh_key_password").val(c.ssh_key_password || "");
  $("#save_connection_checkbox").prop("checked", false);
  $(".save-connection-name").hide().val("");
  $("#connection_error").hide();
}

function loadRecentConnectionIntoForm(id) {
  var c = getRecentConnections().filter(function(x) { return x.id === id; })[0];
  if (!c) return;
  setConnectionMode(c.mode || "standard");
  $("#connection_url").val(c.url || "");
  $("#pg_host").val(c.host || "");
  $("#pg_port").val(c.port || "");
  $("#pg_user").val(c.user || "");
  $("#pg_password").val("");
  $("#pg_db").val(c.db || "");
  $("#connection_ssl").val(c.ssl || "disable");
  $("#connection_error").hide();
  if (c.mode === "scheme") { $("#connection_url").focus(); }
  else { $("#pg_password").focus(); }
}

function tryParseJSON(str) {
  if (typeof str !== "string") return null;
  var s = str.trim();
  if (s.length === 0 || (s[0] !== "{" && s[0] !== "[")) return null;
  try {
    var parsed = JSON.parse(s);
    if (typeof parsed === "object" && parsed !== null) return parsed;
  } catch (e) {}
  return null;
}

function setModalContent(value) {
  if (!contentViewEditor) return;
  var parsed = tryParseJSON(value);
  if (parsed !== null) {
    contentViewEditor.setValue(JSON.stringify(parsed, null, 2), -1);
    contentViewEditor.getSession().setMode("ace/mode/json");
  } else {
    contentViewEditor.setValue(value, -1);
    contentViewEditor.getSession().setMode("ace/mode/text");
  }
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#39;")
    .replace(/"/g, "&quot;");
}

function getCurrentObject() {
  return currentObject || { name: "", type: "" };
}

function resetTable() {
  closeRowSidebar();
  $("#results_header").html("");
  $("#results_body").html("");
  $("#results_view").html("").hide();

  $("#results")
    .data("mode", "")
    .removeClass("empty")
    .removeClass("no-crop")
    .show();
}

function openRowSidebar(tr) {
  var ctid = $(tr).data("ctid");
  var table = $("#results").data("table");
  var mode = $("#results").data("mode");

  if (!ctid || !table || mode !== "browse") {
    closeRowSidebar();
    return;
  }

  rowSidebarCtid = ctid;
  rowSidebarTable = table;

  rowSidebarEditors.forEach(function (ed) { ed.destroy(); });
  rowSidebarEditors = [];
  window.rowSidebarEditors = rowSidebarEditors;

  var theme =
    localStorage.getItem("pgport_theme") === "light"
      ? "ace/theme/tomorrow"
      : "ace/theme/tomorrow_night";

  var fieldsEl = $("#row_sidebar_fields").empty();

  $(tr).find("td").each(function (i) {
    var colName = $(this).data("col-name");
    var value = unescapeHtml($(this).find("div").html());
    if (!colName) return;

    var editorId = "rsf_editor_" + i;
    var fieldEl = $("<div class='row-sidebar-field'></div>");
    fieldEl.append("<label title='" + escapeAttr(colName) + "'>" + escapeHtml(colName) + "</label>");
    fieldEl.append("<div class='row-sidebar-ace' id='" + editorId + "'></div>");
    fieldEl.append("<div class='ace-field-resize-handle'></div>");
    fieldsEl.append(fieldEl);

    var ed = ace.edit(editorId);
    ed.setTheme(theme);
    ed.setShowPrintMargin(false);
    ed.setFontSize(12);
    ed.renderer.setShowGutter(false);
    ed.setHighlightActiveLine(false);
    ed.setOption("useWorker", false);
    ed.getSession().setTabSize(2);
    ed.getSession().setUseSoftTabs(true);

    var isJson = false;
    var parsed = tryParseJSON(value);
    if (parsed !== null) {
      ed.setValue(JSON.stringify(parsed, null, 2), -1);
      ed.getSession().setMode("ace/mode/json");
      isJson = true;
    } else {
      ed.setValue(value !== null && value !== undefined ? String(value) : "", -1);
      ed.getSession().setMode("ace/mode/text");
    }

    var editorMode = localStorage.getItem("editorMode");
    if (editorMode) ed.setKeyboardHandler(editorMode);

    ed._colName = colName;
    ed._isJson = isJson;
    ed._originalValue = ed.getValue();
    rowSidebarEditors.push(ed);
  });

  window.rowSidebarEditors = rowSidebarEditors;

  $("#row_sidebar_error").hide();
  $("#row_sidebar").addClass("open");

  setTimeout(function () {
    rowSidebarEditors.forEach(function (ed) {
      var lineHeight = ed.renderer.lineHeight || 17;
      var lineCount = ed.getSession().getLength();
      var minH = ed._isJson ? 120 : 40;
      var h = Math.min(Math.max(lineCount * lineHeight + 8, minH), 400);
      $(ed.container).height(h);
      ed.resize();
    });
  }, 220);
}

function closeRowSidebar() {
  rowSidebarEditors.forEach(function (ed) { ed.destroy(); });
  rowSidebarEditors = [];
  window.rowSidebarEditors = rowSidebarEditors;
  rowSidebarCtid = null;
  rowSidebarTable = null;

  $("#row_sidebar").removeClass("open");
  $("#row_sidebar_fields").empty();
}

function bindRowSidebar() {
  $("#row_sidebar_close_x, #row_sidebar_close_btn").on("click", function () {
    closeRowSidebar();
  });

  $("#row_sidebar_save").on("click", function () {
    if (!rowSidebarCtid || !rowSidebarTable) return;

    var changed = rowSidebarEditors.filter(function (ed) {
      return ed.getValue() !== ed._originalValue;
    });

    if (changed.length === 0) { closeRowSidebar(); return; }

    var pending = changed.length;
    var errors = [];

    changed.forEach(function (ed) {
      var colName = ed._colName;
      var val = ed.getValue();
      var params = { column: colName, ctid: rowSidebarCtid, value: val };
      if (val === "") params.set_null = "true";
      apiCall(
        "post",
        "/tables/" + rowSidebarTable + "/cell",
        params,
        function (data) {
          pending--;
          if (data && data.error) errors.push(colName + ": " + data.error);
          if (pending === 0) {
            if (errors.length) {
              $("#row_sidebar_error").text(errors.join("; ")).show();
            } else {
              closeRowSidebar();
              showPaginatedTableContent();
            }
          }
        }
      );
    });
  });

  // Sidebar width drag (left edge handle)
  var sidebarEl = document.getElementById("row_sidebar");
  var sidebarResizeHandle = document.getElementById("row_sidebar_resize_handle");
  sidebarResizeHandle.addEventListener("mousedown", function (e) {
    e.preventDefault();
    var startX = e.clientX;
    var startW = sidebarEl.offsetWidth;
    sidebarResizeHandle.classList.add("dragging");
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    function onMove(e) {
      var w = Math.min(Math.max(startW + (startX - e.clientX), 260), Math.floor(window.innerWidth * 0.7));
      sidebarEl.style.width = w + "px";
    }

    function onUp() {
      sidebarResizeHandle.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      rowSidebarEditors.forEach(function (ed) { ed.resize(); });
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  // Per-field height drag (bottom handle of each editor)
  $("#row_sidebar_fields").on("mousedown", ".ace-field-resize-handle", function (e) {
    e.preventDefault();
    var handle = $(this);
    var aceEl = handle.prev(".row-sidebar-ace");
    var startY = e.clientY;
    var startH = aceEl.height();
    var editorId = aceEl.attr("id");
    var ed = rowSidebarEditors.filter(function (ed) { return ed.container.id === editorId; })[0];

    handle.addClass("dragging");
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";

    function onMove(e) {
      var h = Math.max(40, startH + (e.clientY - startY));
      aceEl.height(h);
      if (ed) ed.resize();
    }

    function onUp() {
      handle.removeClass("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      $(document).off("mousemove.fieldresize mouseup.fieldresize");
    }

    $(document).on("mousemove.fieldresize", onMove).on("mouseup.fieldresize", onUp);
  });
}

function performTableAction(table, action, el) {
  if (action == "truncate" || action == "delete") {
    var message =
      "Are you sure you want to " + action + " table " + table + " ?";
    if (!confirm(message)) return;
  }

  switch (action) {
    case "truncate":
      executeQuery("TRUNCATE TABLE " + table, function (data) {
        if (data.error) alert(data.error);
        resetTable();
      });
      break;
    case "delete":
      executeQuery("DROP TABLE " + table, function (data) {
        if (data.error) alert(data.error);
        loadSchemas();
        resetTable();
      });
      break;
    case "export":
      var format = el.data("format");
      var db = $("#current_database").text();
      var filename = db + "." + table + "." + format;
      var query = "SELECT * FROM " + table;
      openInNewWindow("api/query", {
        format: format,
        filename: filename,
        query: query,
      });
      break;
    case "dump":
      openInNewWindow("api/export", { table: table });
      break;
    case "copy":
      copyToClipboard(table.split(".")[1]);
      break;
    case "analyze":
      executeQuery("ANALYZE " + table, function (data) {
        if (data.error) alert(data.error);
        resetTable();
      });
      break;
  }
}

function performViewAction(view, action, el) {
  if (action == "delete") {
    var message = "Are you sure you want to " + action + " view " + view + " ?";
    if (!confirm(message)) return;
  }

  switch (action) {
    case "delete":
      executeQuery("DROP VIEW " + view, function (data) {
        if (data.error) alert(data.error);
        loadSchemas();
        resetTable();
      });
      break;
    case "export":
      var format = el.data("format");
      var db = $("#current_database").text();
      var filename = db + "." + view + "." + format;
      var query = "SELECT * FROM " + view;
      openInNewWindow("api/query", {
        format: format,
        filename: filename,
        query: query,
      });
      break;
    case "copy":
      copyToClipboard(view.split(".")[1]);
      break;
    case "copy_def":
      executeQuery(
        "SELECT pg_get_viewdef('" + view + "', true);",
        function (data) {
          if (data.error) {
            alert(data.error);
            return;
          }
          copyToClipboard(data.rows[0]);
        },
      );
      break;
    case "view_def":
      executeQuery(
        "SELECT pg_get_viewdef('" + view + "', true);",
        function (data) {
          if (data.error) {
            alert(data.error);
            return;
          }
          showViewDefinition(view, data.rows[0]);
        },
      );
      break;
  }
}

function performRowAction(action, value) {
  if (action == "stop_query") {
    if (!confirm("Are you sure you want to stop the query?")) return;
    executeQuery("SELECT pg_cancel_backend(" + value + ");", function (data) {
      if (data.error) alert(data.error);
      setTimeout(showActivityPanel, 1000);
    });
  }
}

function sortArrow(direction) {
  switch (direction) {
    case "ASC":
      return "&#x25B2;";
    case "DESC":
      return "&#x25BC;";
    default:
      return "";
  }
}

function buildTable(results, sortColumn, sortOrder, options) {
  if (!options) options = {};
  var action = options.action;

  resetTable();

  if (results.error) {
    $("#results_header").html("");
    $("#results_body").html("<tr><td>ERROR: " + results.error + "</tr></tr>");
    return;
  }

  if (results.rows.length == 0) {
    $("#results_header").html("");
    $("#results_body").html("<tr><td>No records found</td></tr>");
    if (results.stats) {
      $("#result-rows-count").html(results.stats.query_duration_ms + " ms");
    } else {
      $("#result-rows-count").html("");
    }
    $("#results").addClass("empty");
    return;
  }

  var cols = "";
  var rows = "";

  var ctidColIndex = results.columns.indexOf("ctid");

  results.columns.forEach(function (col, idx) {
    if (idx === ctidColIndex) return; // skip ctid header
    if (col === sortColumn) {
      cols +=
        "<th class='table-header-col active' data-name='" +
        col +
        "' data-order=" +
        sortOrder +
        ">" +
        col +
        "&nbsp;" +
        sortArrow(sortOrder) +
        "</th>";
    } else {
      cols +=
        "<th class='table-header-col' data-name='" + col + "'>" + col + "</th>";
    }
  });

  // No header to make the column non-sortable
  if (action) {
    cols += "<th></th>";

    // Determine which column contains the data attribute
    action.dataColumn = results.columns.indexOf(action.data);
  }

  results.rows.forEach(function (row) {
    var r = "";
    var ctidValue = ctidColIndex >= 0 ? row[ctidColIndex] : null;

    // Add all actual row data here
    for (var i = 0; i < row.length; i++) {
      if (i === ctidColIndex) continue; // skip ctid cell
      var colName = results.columns[i];
      r +=
        "<td data-col='" +
        i +
        "' data-col-name='" +
        escapeAttr(colName) +
        "'><div>" +
        escapeHtml(row[i]) +
        "</div></td>";
    }

    // Add row action button
    if (action) {
      r +=
        "<td><a class='btn btn-xs btn-" +
        action.style +
        " row-action' data-action='" +
        action.name +
        "' data-value='" +
        row[action.dataColumn] +
        "' href='#'>" +
        action.title +
        "</a></td>";
    }

    var ctidAttr = ctidValue
      ? " data-ctid='" + escapeAttr(String(ctidValue)) + "'"
      : "";
    rows += "<tr" + ctidAttr + ">" + r + "</tr>";
  });

  $("#results_header").html(cols);
  $("#results_body").html(rows);

  // Show number of rows rendered on the page
  if (results.stats) {
    $("#result-rows-count").html(
      results.stats.rows_count +
        " rows in " +
        results.stats.query_duration_ms +
        " ms",
    );
  } else {
    $("#result-rows-count").html(results.rows.length + " rows");
  }
}

function setCurrentTab(id) {
  // Pagination should only be visible on rows tab
  if (id != "table_content") {
    $("#body").removeClass("with-pagination");
  }

  $("#nav ul li.selected").removeClass("selected");
  $("#" + id).addClass("selected");

  // Persist tab selection into the session storage
  sessionStorage.setItem("tab", id);
}

function showQueryHistory() {
  getHistory(function (data) {
    var rows = [];

    for (i in data) {
      rows.unshift([parseInt(i) + 1, data[i].query, data[i].timestamp]);
    }

    buildTable({ columns: ["id", "query", "timestamp"], rows: rows });

    setCurrentTab("table_history");
    $("#input").hide();
    $("#body").prop("class", "full");
    $("#results").addClass("no-crop");
  });
}

function showTableIndexes() {
  var name = getCurrentObject().name;

  if (name.length == 0) {
    alert("Please select a table!");
    return;
  }

  getTableIndexes(name, function (data) {
    setCurrentTab("table_indexes");
    buildTable(data);

    $("#input").hide();
    $("#body").prop("class", "full");
    $("#results").addClass("no-crop");
  });
}

function showTableConstraints() {
  var name = getCurrentObject().name;

  if (name.length == 0) {
    alert("Please select a table!");
    return;
  }

  getTableConstraints(name, function (data) {
    setCurrentTab("table_constraints");
    buildTable(data);

    $("#input").hide();
    $("#body").prop("class", "full");
    $("#results").addClass("no-crop");
  });
}

function showTableInfo() {
  var name = getCurrentObject().name;

  if (name.length == 0) {
    alert("Please select a table!");
    return;
  }

  apiCall("get", "/tables/" + name + "/info", {}, function (data) {
    $(".table-information .lines").show();
    $("#table_total_size").text(data.total_size);
    $("#table_data_size").text(data.data_size);
    $("#table_index_size").text(data.index_size);
    $("#table_rows_count").text(data.rows_count);
    $("#table_encoding").text("Unknown");
  });

  buildTableFilters(name, getCurrentObject().type);
}

function updatePaginator(pagination) {
  if (!pagination) {
    $(".current-page").data("page", 1).data("pages", 1);
    $("button.page").text("1 of 1");
    $(".prev-page, .next-page").prop("disabled", "disabled");
    return;
  }

  $(".current-page")
    .data("page", pagination.page)
    .data("pages", pagination.pages_count);

  if (pagination.page > 1) {
    $(".prev-page").prop("disabled", "");
  } else {
    $(".prev-page").prop("disabled", "disabled");
  }

  if (pagination.pages_count > 1 && pagination.page < pagination.pages_count) {
    $(".next-page").prop("disabled", "");
  } else {
    $(".next-page").prop("disabled", "disabled");
  }

  $("#total_records").text(pagination.rows_count);
  if (pagination.pages_count == 0) pagination.pages_count = 1;
  $("button.page").text(pagination.page + " of " + pagination.pages_count);
}

function showTableContent(sortColumn, sortOrder) {
  var name = getCurrentObject().name;

  if (name.length == 0) {
    alert("Please select a table!");
    return;
  }

  if (getCurrentObject().type == "function") {
    alert("Cant view rows for a function");
    return;
  }

  var opts = {
    limit: getRowsLimit(),
    offset: getPaginationOffset(),
    sort_column: sortColumn,
    sort_order: sortOrder,
  };

  var filter = {
    column: $(".filters select.column").val(),
    op: $(".filters select.filter").val(),
    input: $(".filters input").val(),
  };

  // Apply filtering only if column is selected
  if (filter.column && filter.op) {
    var where = [
      '"' + filter.column + '"',
      filterOptions[filter.op].replace("DATA", filter.input),
    ].join(" ");

    opts["where"] = where;
  }

  getTableRows(name, opts, function (data) {
    $("#input").hide();
    $("#body").prop("class", "with-pagination");

    buildTable(data, sortColumn, sortOrder);
    setCurrentTab("table_content");
    updatePaginator(data.pagination);

    $("#results").data("mode", "browse").data("table", name);
  });
}

function showPaginatedTableContent() {
  var activeColumn = $("#results th.active");
  var sortColumn = null;
  var sortOrder = null;

  if (activeColumn.length) {
    sortColumn = activeColumn.data("name");
    sortOrder = activeColumn.data("order");
  }

  showTableContent(sortColumn, sortOrder);
}

function showDatabaseStats() {
  getTablesStats(function (data) {
    buildTable(data);

    setCurrentTab("table_structure");
    $("#input").hide();
    $("#body").prop("class", "full");
    $("#results").addClass("no-crop");
  });
}

function downloadDatabaseStats() {
  openInNewWindow("api/tables_stats", { format: "csv", export: "true" });
}

function showServerSettings() {
  getServerSettings(function (data) {
    buildTable(data);

    setCurrentTab("table_content");
    $("#input").hide();
    $("#body").prop("class", "full");
    $("#results").addClass("no-crop");
  });
}

function showTableStructure() {
  var name = getCurrentObject().name;

  if (name.length == 0) {
    alert("Please select a table!");
    return;
  }

  setCurrentTab("table_structure");

  $("#input").hide();
  $("#body").prop("class", "full");

  getTableStructure(name, { type: getCurrentObject().type }, function (data) {
    if (getCurrentObject().type == "function") {
      var name = data.rows[0][data.columns.indexOf("proname")];
      var definition = data.rows[0][data.columns.indexOf("functiondef")];
      showFunctionDefinition(name, definition);
      return;
    }

    buildTable(data);
    $("#results").addClass("no-crop");
  });
}

function showViewDefinition(viewName, viewDefintion) {
  setCurrentTab("table_structure");
  renderResultsView(
    "View definition for: <strong>" + viewName + "</strong>",
    viewDefintion,
  );
}

function showFunctionDefinition(functionName, definition) {
  setCurrentTab("table_structure");
  renderResultsView(
    "Function definition for: <strong>" + functionName + "</strong>",
    definition,
  );
}

function renderResultsView(title, content) {
  $("#results").addClass("no-crop");
  $("#input").hide();
  $("#body").prop("class", "full");
  $("#results").hide();

  var title = $("<div/>").prop("class", "title").html(title);
  var content = $("<pre/>").text(content);

  $("<div/>")
    .html("<i class='fa fa-copy'></i>")
    .addClass("copy")
    .appendTo(content);

  $("#results_view").html("");
  title.appendTo("#results_view");
  content.appendTo("#results_view");
  $("#results_view").show();
}

function showQueryPanel() {
  if (!$("#table_query").hasClass("selected")) {
    resetTable();
  }

  setCurrentTab("table_query");
  editor.focus();

  $("#input").show();
  $("#body").prop("class", "");
}

function showConnectionPanel() {
  setCurrentTab("table_connection");
  $("#input").hide();
  $("#body").addClass("full");

  getConnection(function (data) {
    var rows = [];

    for (key in data) {
      rows.push([key, data[key]]);
    }

    buildTable({
      columns: ["attribute", "value"],
      rows: rows,
    });
  });
}

function showActivityPanel() {
  var options = {
    action: {
      name: "stop_query",
      title: "stop",
      data: "pid",
      style: "danger",
    },
  };

  setCurrentTab("table_activity");
  $("#input").hide();
  $("#body").addClass("full");

  apiCall("get", "/activity", {}, function (data) {
    buildTable(data, null, null, options);
  });
}

function showQueryProgressMessage() {
  $(
    "#run, #explain-dropdown-toggle, #csv, #json, #xml, #load-local-query",
  ).prop("disabled", true);
  $("#explain-dropdown").removeClass("open");
  $("#query_progress").show();
}

function hideQueryProgressMessage() {
  $(
    "#run, #explain-dropdown-toggle, #csv, #json, #xml, #load-local-query",
  ).prop("disabled", false);
  $("#query_progress").hide();
}

function getEditorSelection() {
  // Return the exact selection if user has one
  var query = $.trim(editor.getSelectedText());
  if (query.length > 0) {
    return query;
  }

  query = editor.getValue();

  // Determine which query we should run when there are multiple queries without a delimiter
  if (query.indexOf(";") == -1) {
    var subquery = getSubquery(query, editor.getCursorPosition());

    if (subquery) {
      // Highlight query selection so user knows what is being executed
      if (subquery.numChunks > 1) {
        editor.selection.setSelectionRange({
          start: { row: subquery.startRow, column: 0 },
          end: { row: subquery.endRow, column: 0 },
        });
      }

      return subquery.text;
    }
  }

  return query;
}

function getSubquery(text, cursor) {
  var lines = text.split("\n");
  var startRow = undefined;
  var numChunks = 0;
  var ranges = [];

  for (i = 0; i < lines.length; i++) {
    if (lines[i].trim().length == 0) {
      if (startRow >= 0 && cursor.row >= startRow && cursor.row <= i) {
        ranges.push([startRow, i]);
      }

      numChunks++;
      startRow = undefined;
      continue;
    }

    if (startRow === undefined) {
      startRow = i;
    }

    if (i == lines.length - 1) {
      ranges.push([startRow, i + 1]);
      numChunks++;
    }
  }

  if (ranges.length > 0) {
    return {
      text: lines.slice(ranges[0][0], ranges[0][1]).join("\n"),
      startRow: ranges[0][0],
      endRow: ranges[0][1],
      numChunks: numChunks,
    };
  }
}

function formatSQL(sql) {
  if (!sql || !sql.trim()) return sql;

  var INDENT = "  ";

  // Protect string literals and quoted identifiers
  var protected_parts = [];
  function protect(m) {
    protected_parts.push(m);
    return "\x00" + (protected_parts.length - 1) + "\x00";
  }
  sql = sql.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\$\$[\s\S]*?\$\$/g, protect);

  // Normalize whitespace
  sql = sql.replace(/\s+/g, " ").trim();

  // Major clause keywords → newline before
  var clauses = [
    "SELECT DISTINCT", "SELECT",
    "INSERT INTO", "INSERT",
    "UPDATE",
    "DELETE FROM", "DELETE",
    "FROM",
    "SET",
    "WHERE",
    "INNER JOIN", "LEFT OUTER JOIN", "RIGHT OUTER JOIN", "FULL OUTER JOIN",
    "CROSS JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL JOIN", "JOIN",
    "ON",
    "GROUP BY",
    "HAVING",
    "ORDER BY",
    "LIMIT",
    "OFFSET",
    "UNION ALL", "UNION",
    "INTERSECT",
    "EXCEPT",
    "VALUES",
    "RETURNING",
    "WITH",
  ];

  var clauseRe = new RegExp(
    "\\b(" + clauses.map(function (k) { return k.replace(/ /g, "\\s+"); }).join("|") + ")\\b",
    "gi"
  );
  sql = sql.replace(clauseRe, function (m) { return "\n" + m.toUpperCase(); });

  // AND / OR in conditions → indent
  sql = sql.replace(/\b(AND|OR)\b/gi, function (m) { return "\n  " + m.toUpperCase(); });

  // Depth-based indentation via paren tracking
  var lines = sql.split("\n");
  var depth = 0;
  var output = [];

  lines.forEach(function (line) {
    line = line.trim();
    if (!line) return;

    var bare = line.replace(/\x00\d+\x00/g, "");
    var opens = (bare.match(/\(/g) || []).length;
    var closes = (bare.match(/\)/g) || []).length;

    if (closes > opens) depth = Math.max(0, depth - (closes - opens));
    output.push(INDENT.repeat(depth) + line);
    if (opens > closes) depth += opens - closes;
  });

  sql = output.join("\n");

  // Restore protected parts
  sql = sql.replace(/\x00(\d+)\x00/g, function (m, i) { return protected_parts[+i]; });

  return sql.trim();
}

function runFormatQuery() {
  var sql = editor.getValue();
  if (!sql.trim()) return;
  var formatted = formatSQL(sql);
  editor.setValue(formatted, -1);
}

function runQuery() {
  setCurrentTab("table_query");
  showQueryProgressMessage();

  var query = getEditorSelection();
  if (query.length == 0) {
    hideQueryProgressMessage();
    return;
  }

  executeQuery(query, function (data) {
    buildTable(data);

    hideQueryProgressMessage();
    $("#input").show();
    $("#body").removeClass("full");
    $("#results").data("mode", "query");

    if (query.toLowerCase().indexOf("explain") != -1) {
      $("#results").addClass("no-crop");
    }

    // Reload objects list if anything was created/deleted
    if (query.match(/(create|drop)\s/i)) {
      loadSchemas();
    }
  });
}

function runExplain() {
  setCurrentTab("table_query");
  showQueryProgressMessage();

  var query = getEditorSelection();
  if (query.length == 0) {
    hideQueryProgressMessage();
    return;
  }

  explainQuery(query, function (data) {
    buildTable(data);

    hideQueryProgressMessage();
    $("#input").show();
    $("#body").removeClass("full");
    $("#results").addClass("no-crop");
  });
}

function runAnalyze() {
  setCurrentTab("table_query");
  showQueryProgressMessage();

  var query = getEditorSelection();
  if (query.length == 0) {
    hideQueryProgressMessage();
    return;
  }

  analyzeQuery(query, function (data) {
    buildTable(data);

    hideQueryProgressMessage();
    $("#input").show();
    $("#body").removeClass("full");
    $("#results").addClass("no-crop");
  });
}

function generateURL(path, params) {
  var url = new URL(window.location.href.split("#")[0]);

  url.pathname += path;
  for (key in params) {
    url.searchParams.append(key, params[key]);
  }

  // Automatically append session id so we dont have to do that everywhere
  url.searchParams.append("_session_id", getSessionId());

  return url.toString();
}

function openInNewWindow(path, params) {
  var url = generateURL(path, params);
  var win = window.open(url, "_blank");
  win.focus();
}

function exportTo(format) {
  var query = getEditorSelection();
  if (query.length == 0) {
    return;
  }

  setCurrentTab("table_query");

  openInNewWindow("api/query", {
    format: format,
    query: encodeQuery(query),
  });
}

// Fetch all unique values for the selected column in the table
function showUniqueColumnsValues(table, column, showCounts) {
  var query = 'SELECT DISTINCT "' + column + '" FROM ' + table;

  // Display results ordered by counts.
  // This could be slow on large sets without an index.
  if (showCounts) {
    query =
      'SELECT DISTINCT "' +
      column +
      '", COUNT(1) AS total_count FROM ' +
      table +
      ' GROUP BY "' +
      column +
      '" ORDER BY total_count DESC';
  }

  executeQuery(query, function (data) {
    $("#input").hide();
    $("#body").prop("class", "full");
    $("#results").data("mode", "query");
    buildTable(data);
  });
}

// Show numeric stats on the field
function showFieldNumStats(table, column) {
  var query =
    "SELECT count(1), min(" +
    column +
    "), max(" +
    column +
    "), avg(" +
    column +
    ") FROM " +
    table;

  executeQuery(query, function (data) {
    $("#input").hide();
    $("#body").prop("class", "full");
    $("#results").data("mode", "query");
    buildTable(data);
  });
}

function buildTableFilters(name, type) {
  getTableStructure(name, { type: type }, function (data) {
    if (data.rows.length == 0) {
      $("#pagination .filters").hide();
    } else {
      $("#pagination .filters").show();
    }

    $("#pagination select.column").html(
      "<option value='' selected>Select column</option>",
    );

    for (var i = 0; i < data.rows.length; i++) {
      var row = data.rows[i];

      var el = $("<option/>").attr("value", row[0]).text(row[0]);
      $("#pagination select.column").append(el);
    }
  });
}

var columnCache = {};

function fetchColumnsForTable(table, cb) {
  if (columnCache[table] !== undefined) {
    cb(columnCache[table]);
    return;
  }
  columnCache[table] = [];
  getTableStructure(table, {}, function (data) {
    if (data && !data.error && data.columns) {
      var colNameIdx = data.columns.indexOf("column_name");
      var dataTypeIdx = data.columns.indexOf("data_type");
      columnCache[table] = (data.rows || []).map(function (row) {
        return {
          caption: row[colNameIdx],
          value: row[colNameIdx],
          meta: row[dataTypeIdx] || "column",
          score: 900,
        };
      });
    }
    cb(columnCache[table]);
  });
}

function extractReferencedTables(sql) {
  var tables = [];
  var re = /\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)/gi;
  var match;
  while ((match = re.exec(sql)) !== null) {
    var name = match[1].split(".").pop();
    if (tables.indexOf(name) === -1) tables.push(name);
  }
  return tables;
}

var objectAutocompleter = {
  getCompletions: function (editor, session, pos, prefix, callback) {
    var line = session.getLine(pos.row);
    var textBefore = line.substring(0, pos.column);

    var dotMatch = textBefore.match(/\b(\w+)\.(\w*)$/);
    if (dotMatch) {
      fetchColumnsForTable(dotMatch[1], function (cols) {
        callback(null, cols);
      });
      return;
    }

    var tables = extractReferencedTables(session.getValue());
    if (tables.length === 0) {
      callback(null, autocompleteObjects);
      return;
    }

    var pending = tables.length;
    var extra = [];
    tables.forEach(function (table) {
      fetchColumnsForTable(table, function (cols) {
        extra = extra.concat(cols);
        if (--pending === 0) {
          callback(null, autocompleteObjects.concat(extra));
        }
      });
    });
  },
};

function saveQueryTabs() {
  localStorage.setItem("pgweb_query_tabs", JSON.stringify(queryTabs));
  localStorage.setItem("pgweb_active_tab", activeTabId);
}

function getActiveTab() {
  return queryTabs.find(function (t) {
    return t.id === activeTabId;
  });
}

function renderQueryTabs() {
  var $container = $("#query-tabs");
  $container.empty();
  queryTabs.forEach(function (tab) {
    var safeName = $("<span>").text(tab.name).html();
    var $tab = $(
      '<div class="query-tab" data-tab-id="' +
        tab.id +
        '">' +
        '<span class="tab-name">' +
        safeName +
        "</span>" +
        (queryTabs.length > 1
          ? '<span class="tab-close" title="Close tab">&times;</span>'
          : "") +
        "</div>",
    );
    if (tab.id === activeTabId) $tab.addClass("active");
    $container.append($tab);
  });
}

function addQueryTab() {
  if (activeTabId && editor) {
    var cur = getActiveTab();
    if (cur) cur.query = editor.getValue();
  }
  var id = "tab_" + Date.now();
  queryTabs.push({
    id: id,
    name: "Query " + (queryTabs.length + 1),
    query: "",
  });
  activeTabId = id;
  saveQueryTabs();
  renderQueryTabs();
  if (editor) {
    editor.setValue("");
    editor.clearSelection();
    editor.focus();
  }
}

function switchQueryTab(id) {
  if (id === activeTabId) return;
  if (activeTabId && editor) {
    var cur = getActiveTab();
    if (cur) cur.query = editor.getValue();
  }
  activeTabId = id;
  saveQueryTabs();
  renderQueryTabs();
  var tab = queryTabs.find(function (t) {
    return t.id === id;
  });
  if (tab && editor) {
    editor.setValue(tab.query || "");
    editor.clearSelection();
    editor.focus();
  }
}

function closeQueryTab(id) {
  if (queryTabs.length <= 1) return;
  var idx = queryTabs.findIndex(function (t) {
    return t.id === id;
  });
  queryTabs.splice(idx, 1);
  if (activeTabId === id) {
    var newIdx = Math.min(idx, queryTabs.length - 1);
    activeTabId = queryTabs[newIdx].id;
    if (editor) {
      editor.setValue(queryTabs[newIdx].query || "");
      editor.clearSelection();
    }
  }
  saveQueryTabs();
  renderQueryTabs();
}

function initQueryTabs() {
  var stored = localStorage.getItem("pgweb_query_tabs");
  var storedActive = localStorage.getItem("pgweb_active_tab");

  if (stored) {
    try {
      queryTabs = JSON.parse(stored);
    } catch (e) {
      queryTabs = [];
    }
  }

  if (!queryTabs || queryTabs.length === 0) {
    var oldQuery = localStorage.getItem("pgweb_query") || "";
    queryTabs = [{ id: "tab_1", name: "Query 1", query: oldQuery }];
    storedActive = "tab_1";
  }

  activeTabId =
    storedActive &&
    queryTabs.find(function (t) {
      return t.id === storedActive;
    })
      ? storedActive
      : queryTabs[0].id;

  renderQueryTabs();

  var activeTab = getActiveTab();
  if (activeTab && editor) {
    editor.setValue(activeTab.query || "");
    editor.clearSelection();
  }

  $("#query-tabs").on("click", ".query-tab", function (e) {
    if ($(e.target).hasClass("tab-close")) return;
    switchQueryTab($(this).data("tab-id"));
  });

  $("#query-tabs").on("click", ".tab-close", function (e) {
    e.stopPropagation();
    closeQueryTab($(this).closest(".query-tab").data("tab-id"));
  });

  $("#query-tabs").on("dblclick", ".tab-name", function (e) {
    e.stopPropagation();
    var $tab = $(this).closest(".query-tab");
    var id = $tab.data("tab-id");
    var tab = queryTabs.find(function (t) {
      return t.id === id;
    });
    if (!tab) return;
    var newName = prompt("Tab name:", tab.name);
    if (newName && newName.trim()) {
      tab.name = newName.trim();
      saveQueryTabs();
      renderQueryTabs();
    }
  });

  $("#add-query-tab").on("click", function () {
    addQueryTab();
  });
}

function initEditor() {
  var writeQueryTimeout = null;
  var lastSelectedMode = localStorage.getItem("editorMode") || null;

  editor = ace.edit("custom_query");
  editor.setOptions({
    enableBasicAutocompletion: true,
    enableLiveAutocompletion: true,
  });
  editor.completers.push(objectAutocompleter);

  editor.setFontSize(13);
  editor.setTheme("ace/theme/tomorrow");
  editor.setShowPrintMargin(false);
  editor.getSession().setMode("ace/mode/pgsql");
  editor.getSession().setTabSize(2);
  editor.getSession().setUseSoftTabs(true);
  editor.setKeyboardHandler(lastSelectedMode);

  editor.commands.addCommands([
    {
      name: "run_query",
      bindKey: {
        win: "Ctrl-Enter",
        mac: "Command-Enter",
      },
      exec: function (editor) {
        runQuery();
      },
    },
    {
      name: "explain_query",
      bindKey: {
        win: "Ctrl-E",
        mac: "Command-E",
      },
      exec: function (editor) {
        runExplain();
      },
    },
  ]);

  editor.on("change", function () {
    if (writeQueryTimeout) {
      clearTimeout(writeQueryTimeout);
    }

    writeQueryTimeout = setTimeout(function () {
      var cur = getActiveTab();
      if (cur) {
        cur.query = editor.getValue();
        saveQueryTabs();
      }
    }, 1000);
  });

  if (lastSelectedMode == "ace/keyboard/vim") {
    $("#vim-mode").addClass("active");
    $("#norm-mode").removeClass("active");
  }

  $("#vim-mode").click(function () {
    editor.setKeyboardHandler("ace/keyboard/vim");
    $("#vim-mode").addClass("active");
    $("#norm-mode").removeClass("active");
    localStorage.setItem("editorMode", "ace/keyboard/vim");
  });

  $("#norm-mode").click(function () {
    editor.setKeyboardHandler(null);
    $("#norm-mode").addClass("active");
    $("#vim-mode").removeClass("active");
    localStorage.setItem("editorMode", null);
  });
}

function addShortcutTooltips() {
  if (navigator.userAgent.indexOf("OS X") > 0) {
    $("#run").attr("title", "Shortcut: ⌘+Enter");
    $("#explain").attr("title", "Shortcut: ⌘+E");
  } else {
    $("#run").attr("title", "Shortcut: Ctrl+Enter");
    $("#explain").attr("title", "Shortcut: Ctrl+E");
  }
}

// Get the latest release from Github API
function getLatestReleaseInfo(current) {
  try {
    $.get(
      "https://api.github.com/repos/mohamedelhefni/pgport/releases/latest",
      function (release) {
        if (release.name != current.version) {
          var message =
            "Update available. Check out " +
            release.tag_name +
            " on <a target='_blank' href='" +
            release.html_url +
            "'>Github</a>";
          $(".connection-page-header .update").html(message).fadeIn();
        }
      },
    );
  } catch (error) {
    console.log("Cant get last release from github:", error);
  }
}

function showConnectionSettings() {
  // Show the current postgres version
  $(".connection-page-header .version")
    .text("v" + appInfo.version)
    .show();
  $("#connection_window").show();
  initConnectionWindow();
  renderConnectionsSidebar();

  // Check github release page for updates
  getLatestReleaseInfo(appInfo);

  getBookmarks(function (data) {
    if (data.error) {
      console.log("Error while fetching bookmarks:", data.error);
      return;
    }

    if (data.length > 0) {
      // Set bookmarks in global var
      bookmarks = data;

      // Remove all existing bookmark options
      $("#connection_bookmarks").html("");

      // Add blank option
      $(
        "<option value=''>Select a bookmarked database to connect to</option>",
      ).appendTo("#connection_bookmarks");

      // Add all available bookmarks
      for (key of data) {
        $("<option value='" + key + "''>" + key + "</option>").appendTo(
          "#connection_bookmarks",
        );
      }

      $(".bookmarks").show();
    } else {
      if (appFeatures.bookmarks_only) {
        $("#connection_error")
          .html(
            "Running in <b>bookmarks-only</b> mode but <b>NO</b> bookmarks configured.",
          )
          .show();
        $(".open-connection").hide();
      } else {
        $(".bookmarks").hide();
      }
    }
  });
}

function initConnectionWindow() {
  if (appFeatures.bookmarks_only) {
    $(".connection-group-switch").hide();
    $(".connection-scheme-group").hide();
    $(".connection-bookmarks-group").show();
    $(".connection-standard-group").hide();
    $(".connection-ssh-group").hide();
    $("#save_connection_group").hide();
  } else {
    $(".connection-group-switch").show();
    $(".connection-scheme-group").hide();
    $(".connection-bookmarks-group").show();
    $(".connection-standard-group").show();
    $(".connection-ssh-group").hide();
    $("#save_connection_group").show();
  }
}

function getConnectionString() {
  var url = $.trim($("#connection_url").val());
  var mode = $(".connection-group-switch button.active").attr("data");
  var ssl = $("#connection_ssl").val();

  if (mode == "standard" || mode == "ssh") {
    var host = $("#pg_host").val();
    var port = $("#pg_port").val();
    var user = $("#pg_user").val();
    var pass = encodeURIComponent($("#pg_password").val());
    var db = $("#pg_db").val();

    if (port.length == 0) {
      port = "5432";
    }

    url =
      "postgres://" +
      user +
      ":" +
      pass +
      "@" +
      host +
      ":" +
      port +
      "/" +
      db +
      "?sslmode=" +
      ssl;
  } else {
    var local =
      url.indexOf("localhost") != -1 || url.indexOf("127.0.0.1") != -1;

    if (local && url.indexOf("sslmode") == -1) {
      url += "?sslmode=" + ssl;
    }
  }

  return url;
}

// Add a context menu to the results table header columns
function bindTableHeaderMenu() {
  $("#results_header").contextmenu({
    scopes: "th",
    target: "#results_header_menu",
    before: function (e, element, target) {
      // Enable menu for browsing table rows view only.
      if ($("#results").data("mode") != "browse") {
        e.preventDefault();
        this.closemenu();
        return false;
      }
    },
    onItem: function (context, e) {
      var menuItem = $(e.target);

      switch (menuItem.data("action")) {
        case "copy_name":
          copyToClipboard($(context).data("name"));
          break;

        case "unique_values":
          showUniqueColumnsValues(
            $("#results").data("table"), // table name
            $(context).data("name"), // column name
            menuItem.data("counts"), // display counts
          );
          break;

        case "num_stats":
          showFieldNumStats(
            $("#results").data("table"), // table name
            $(context).data("name"), // column name
          );
          break;
      }
    },
  });

  $("#results_body").contextmenu({
    scopes: "td",
    target: "#results_row_menu",
    before: function (e, element, target) {
      var browseMode = $("#results").data("mode");
      var isEmpty = $("#results").hasClass("empty");
      var isAllowed = browseMode == "browse" || browseMode == "query";

      if (isEmpty || !isAllowed) {
        e.preventDefault();
        this.closemenu();
        return false;
      }
    },
    onItem: function (context, e) {
      var menuItem = $(e.target);

      switch (menuItem.data("action")) {
        case "display_value":
          var value = $(context).text();
          setModalContent(value);
          $("#content_modal").show();
          break;
        case "copy_value":
          copyToClipboard($(context).text());
          break;
        case "filter_by_value":
          var colIdx = $(context).data("col");
          var colValue = $(context).text();
          var colName = $("#results_header th").eq(colIdx).data("name");

          $("select.column").val(colName);
          $("select.filter").val("equal");
          $("#table_filter_value").val(colValue);
          $("#rows_filter").submit();
          break;
        case "delete_row":
          var tr = $(context).closest("tr");
          var ctid = tr.data("ctid");
          var tableName = $("#results").data("table");
          if (!ctid || !tableName) break;
          if (!confirm("Delete this row?")) break;
          executeQuery(
            "DELETE FROM " + tableName + " WHERE ctid = '" + ctid + "'",
            function (data) {
              if (data && data.error) {
                alert("Error: " + data.error);
                return;
              }
              closeRowSidebar();
              showPaginatedTableContent();
            }
          );
          break;
      }
    },
  });
}

function bindCurrentDatabaseMenu() {
  $("#current_database").contextmenu({
    target: "#current_database_context_menu",
    onItem: function (context, e) {
      var menuItem = $(e.target);

      switch (menuItem.data("action")) {
        case "show_db_stats":
          showDatabaseStats();
          break;
        case "download_db_stats":
          downloadDatabaseStats();
          break;
        case "server_settings":
          showServerSettings();
          break;
        case "export":
          openInNewWindow("api/export");
          break;
      }
    },
  });
}

function initFinder() {
  var finderActiveIdx = -1;
  var finderFiltered = [];

  var typeIcons = {
    table: "fa-table",
    view: "fa-table",
    materialized_view: "fa-table",
    function: "fa-bolt",
  };

  var typeLabels = {
    table: "table",
    view: "view",
    materialized_view: "mat. view",
    function: "function",
  };

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    var escaped = escapeHtml(text);
    var escapedQ = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return escaped.replace(
      new RegExp("(" + escapedQ + ")", "gi"),
      "<em>$1</em>",
    );
  }

  function renderResults(query) {
    var q = (query || "").toLowerCase().trim();
    if (!q) {
      finderFiltered = finderObjects.slice(0, 100);
    } else {
      finderFiltered = finderObjects
        .filter(function (o) {
          return (
            o.name.toLowerCase().indexOf(q) !== -1 ||
            o.schema.toLowerCase().indexOf(q) !== -1
          );
        })
        .slice(0, 100);
    }

    var list = $("#finder_results");
    list.empty();
    finderActiveIdx = finderFiltered.length > 0 ? 0 : -1;

    if (finderFiltered.length === 0) {
      list.append("<li class='finder-empty'>No results</li>");
      return;
    }

    finderFiltered.forEach(function (obj, i) {
      var icon = typeIcons[obj.type] || "fa-table";
      var label = typeLabels[obj.type] || obj.type;
      var li = $("<li>")
        .attr("data-idx", i)
        .append(
          "<span class='finder-item-icon'><i class='fa " +
            icon +
            "'></i></span>",
        )
        .append(
          "<span class='finder-item-name'>" +
            highlightMatch(obj.name, query) +
            "</span>",
        )
        .append(
          "<span class='finder-item-schema'>" +
            escapeHtml(obj.schema) +
            "</span>",
        )
        .append("<span class='finder-item-meta'>" + label + "</span>");
      list.append(li);
    });

    updateActive();
  }

  function updateActive() {
    $("#finder_results li").removeClass("finder-active");
    if (finderActiveIdx >= 0) {
      var active = $("#finder_results li[data-idx=" + finderActiveIdx + "]");
      active.addClass("finder-active");
      active[0] && active[0].scrollIntoView({ block: "nearest" });
    }
  }

  function selectItem(idx) {
    if (idx < 0 || idx >= finderFiltered.length) return;
    var obj = finderFiltered[idx];
    closeFinder();

    currentObject = { name: obj.id, type: obj.type };

    var sidebarItem = $("#objects li.schema-item[data-id='" + obj.id + "']");
    if (sidebarItem.length) {
      $("#objects li").removeClass("active");
      sidebarItem.addClass("active");
      // Expand parent schema and group if collapsed
      sidebarItem.closest(".schema").addClass("expanded");
      sidebarItem.closest(".schema-group").addClass("expanded");
    }

    $(".current-page").data("page", 1);
    $(".filters select, .filters input").val("");

    if (obj.type == "function") {
      sessionStorage.setItem("tab", "table_structure");
      showTableStructure();
    } else {
      showTableInfo();
      switch (sessionStorage.getItem("tab")) {
        case "table_content":
          showTableContent();
          break;
        case "table_structure":
          showTableStructure();
          break;
        case "table_constraints":
          showTableConstraints();
          break;
        case "table_indexes":
          showTableIndexes();
          break;
        default:
          showTableContent();
      }
    }
  }

  function openFinder() {
    if (!connected) return;
    $("#finder_overlay").show();
    $("#finder_modal").show();
    $("#finder_input").val("").focus();
    renderResults("");
  }

  function closeFinder() {
    $("#finder_overlay").hide();
    $("#finder_modal").hide();
    finderActiveIdx = -1;
    finderFiltered = [];
  }

  // Keyboard shortcut: Cmd+P / Ctrl+P
  $(document).on("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "p") {
      e.preventDefault();
      if ($("#finder_modal").is(":visible")) {
        closeFinder();
      } else {
        openFinder();
      }
      return;
    }

    if (!$("#finder_modal").is(":visible")) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closeFinder();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      finderActiveIdx = Math.min(
        finderActiveIdx + 1,
        finderFiltered.length - 1,
      );
      updateActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      finderActiveIdx = Math.max(finderActiveIdx - 1, 0);
      updateActive();
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectItem(finderActiveIdx);
    }
  });

  $("#finder_input").on("input", function () {
    renderResults($(this).val());
  });

  $("#finder_results").on("click", "li[data-idx]", function () {
    selectItem(parseInt($(this).attr("data-idx"), 10));
  });

  $("#finder_results").on("mousemove", "li[data-idx]", function () {
    finderActiveIdx = parseInt($(this).attr("data-idx"), 10);
    updateActive();
  });

  $("#finder_overlay").on("click", closeFinder);
}

function initHistoryFinder() {
  var historyActiveIdx = -1;
  var historyFiltered = [];
  var historyData = [];

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    var escaped = escapeHtml(text);
    var escapedQ = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return escaped.replace(new RegExp("(" + escapedQ + ")", "gi"), "<em>$1</em>");
  }

  function updateHistoryActive() {
    var $items = $("#history_results li[data-idx]");
    $items.removeClass("history-active");
    if (historyActiveIdx >= 0) {
      var $active = $items.filter('[data-idx="' + historyActiveIdx + '"]');
      $active.addClass("history-active");
      var container = document.getElementById("history_results");
      var el = $active[0];
      if (el && container) {
        var elBottom = el.offsetTop + el.offsetHeight;
        var contBottom = container.scrollTop + container.clientHeight;
        if (elBottom > contBottom) container.scrollTop = elBottom - container.clientHeight;
        else if (el.offsetTop < container.scrollTop) container.scrollTop = el.offsetTop;
      }
    }
  }

  function renderHistoryResults(query) {
    var q = (query || "").toLowerCase().trim();
    historyFiltered = !q
      ? historyData.slice(0, 100)
      : historyData.filter(function (h) {
          return h.query.toLowerCase().indexOf(q) !== -1;
        }).slice(0, 100);

    var $list = $("#history_results");
    $list.empty();

    if (historyFiltered.length === 0) {
      $list.append('<li class="history-empty">No history found</li>');
      return;
    }

    historyFiltered.forEach(function (h, idx) {
      var preview = h.query.replace(/\s+/g, " ").trim();
      var display = preview.length > 90 ? preview.slice(0, 90) + "\u2026" : preview;
      var ts = h.timestamp
        ? '<span class="history-item-ts">' + escapeHtml(h.timestamp) + "</span>"
        : "";
      $list.append(
        '<li data-idx="' + idx + '">' +
          '<i class="fa fa-history history-item-icon"></i>' +
          '<span class="history-item-query">' + highlightMatch(display, q) + "</span>" +
          ts +
        "</li>"
      );
    });

    updateHistoryActive();
  }

  function selectHistoryItem(idx) {
    var h = historyFiltered[idx];
    if (!h) return;
    closeHistoryFinder();
    editor.setValue(h.query);
    editor.clearSelection();
    editor.focus();
    $("#table_query").click();
  }

  function openHistoryFinder() {
    if (!connected) return;
    getHistory(function (data) {
      // newest first
      historyData = (data || []).slice().reverse();
      historyActiveIdx = historyData.length > 0 ? 0 : -1;
      renderHistoryResults("");
    });
    $("#history_overlay").show();
    $("#history_modal").show();
    $("#history_input").val("").focus();
  }

  function closeHistoryFinder() {
    $("#history_overlay").hide();
    $("#history_modal").hide();
    historyActiveIdx = -1;
    historyFiltered = [];
  }

  // Ctrl+Shift+H / Cmd+Shift+H — toggle history finder
  $(document).on("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "H") {
      e.preventDefault();
      if ($("#history_modal").is(":visible")) {
        closeHistoryFinder();
      } else {
        openHistoryFinder();
      }
      return;
    }

    if (!$("#history_modal").is(":visible")) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closeHistoryFinder();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      historyActiveIdx = Math.min(historyActiveIdx + 1, historyFiltered.length - 1);
      updateHistoryActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      historyActiveIdx = Math.max(historyActiveIdx - 1, 0);
      updateHistoryActive();
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectHistoryItem(historyActiveIdx);
    }
  });

  $("#history_input").on("input", function () {
    historyActiveIdx = 0;
    renderHistoryResults($(this).val());
  });

  $("#history_results").on("click", "li[data-idx]", function () {
    selectHistoryItem(parseInt($(this).attr("data-idx"), 10));
  });

  $("#history_results").on("mousemove", "li[data-idx]", function () {
    historyActiveIdx = parseInt($(this).attr("data-idx"), 10);
    updateHistoryActive();
  });

  $("#history_overlay").on("click", closeHistoryFinder);
}

var FAVORITES_KEY = "pgweb_favorite_queries";

function getFavorites() {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"); }
  catch (e) { return []; }
}

function saveFavorites(list) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
}

function initFavoritesFinder() {
  var favActiveIdx = -1;
  var favFiltered = [];

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    var escaped = escapeHtml(text);
    var escapedQ = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return escaped.replace(new RegExp("(" + escapedQ + ")", "gi"), "<em>$1</em>");
  }

  function updateFavActive() {
    var $items = $("#favorites_results li[data-idx]");
    $items.removeClass("fav-active");
    if (favActiveIdx >= 0) {
      var $active = $items.filter('[data-idx="' + favActiveIdx + '"]');
      $active.addClass("fav-active");
      var container = document.getElementById("favorites_results");
      var el = $active[0];
      if (el && container) {
        var elBottom = el.offsetTop + el.offsetHeight;
        var contBottom = container.scrollTop + container.clientHeight;
        if (elBottom > contBottom) container.scrollTop = elBottom - container.clientHeight;
        else if (el.offsetTop < container.scrollTop) container.scrollTop = el.offsetTop;
      }
    }
  }

  function renderFavResults(query) {
    var q = (query || "").toLowerCase().trim();
    var all = getFavorites();
    favFiltered = !q
      ? all
      : all.filter(function (f) {
          return f.name.toLowerCase().indexOf(q) !== -1 ||
                 f.query.toLowerCase().indexOf(q) !== -1;
        });

    var $list = $("#favorites_results");
    $list.empty();

    if (favFiltered.length === 0) {
      $list.append('<li class="favorites-empty">No favorites saved</li>');
      return;
    }

    favFiltered.forEach(function (f, idx) {
      var preview = f.query.replace(/\s+/g, " ").trim();
      var display = preview.length > 70 ? preview.slice(0, 70) + "…" : preview;
      $list.append(
        '<li data-idx="' + idx + '">' +
          '<i class="fa fa-star fav-icon"></i>' +
          '<span class="fav-name">' + highlightMatch(f.name, q) + "</span>" +
          '<span class="fav-query">' + highlightMatch(display, q) + "</span>" +
          '<button class="fav-delete" data-idx="' + idx + '" title="Delete favorite"><i class="fa fa-times"></i></button>' +
        "</li>"
      );
    });

    updateFavActive();
  }

  function selectFavItem(idx) {
    var f = favFiltered[idx];
    if (!f) return;
    closeFavoritesFinder();
    editor.setValue(f.query);
    editor.clearSelection();
    editor.focus();
    $("#table_query").click();
  }

  function deleteFavItem(idx) {
    var f = favFiltered[idx];
    if (!f) return;
    var all = getFavorites();
    saveFavorites(all.filter(function (item) { return item.id !== f.id; }));
    favActiveIdx = Math.min(favActiveIdx, favFiltered.length - 2);
    renderFavResults($("#favorites_input").val());
  }

  function openFavoritesFinder() {
    favActiveIdx = getFavorites().length > 0 ? 0 : -1;
    renderFavResults("");
    $("#favorites_overlay").show();
    $("#favorites_modal").show();
    $("#favorites_input").val("").focus();
  }

  function closeFavoritesFinder() {
    $("#favorites_overlay").hide();
    $("#favorites_modal").hide();
    favActiveIdx = -1;
    favFiltered = [];
  }

  // Ctrl+Shift+F — toggle favorites (use Ctrl on both platforms; Cmd+Shift+F is reserved by browsers on Mac)
  $(document).on("keydown", function (e) {
    if (e.ctrlKey && e.shiftKey && e.key === "F") {
      e.preventDefault();
      if ($("#favorites_modal").is(":visible")) {
        closeFavoritesFinder();
      } else {
        openFavoritesFinder();
      }
      return;
    }

    if (!$("#favorites_modal").is(":visible")) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closeFavoritesFinder();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      favActiveIdx = Math.min(favActiveIdx + 1, favFiltered.length - 1);
      updateFavActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      favActiveIdx = Math.max(favActiveIdx - 1, 0);
      updateFavActive();
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectFavItem(favActiveIdx);
    } else if (e.key === "Delete" && favActiveIdx >= 0) {
      e.preventDefault();
      deleteFavItem(favActiveIdx);
    }
  });

  $("#favorites_input").on("input", function () {
    favActiveIdx = 0;
    renderFavResults($(this).val());
  });

  $("#favorites_results").on("click", "li[data-idx]", function (e) {
    if ($(e.target).closest(".fav-delete").length) return;
    selectFavItem(parseInt($(this).attr("data-idx"), 10));
  });

  $("#favorites_results").on("mousemove", "li[data-idx]", function () {
    favActiveIdx = parseInt($(this).attr("data-idx"), 10);
    updateFavActive();
  });

  $("#favorites_results").on("click", ".fav-delete", function (e) {
    e.stopPropagation();
    deleteFavItem(parseInt($(this).attr("data-idx"), 10));
  });

  $("#favorites_overlay").on("click", closeFavoritesFinder);

  // Register in Ace so it doesn't swallow Ctrl+Shift+F before bubbling to document
  editor.commands.addCommand({
    name: "open_favorites",
    bindKey: { win: "Ctrl-Shift-F", mac: "Ctrl-Shift-F" },
    exec: function () { openFavoritesFinder(); }
  });

  $("#open-favorites").on("click", openFavoritesFinder);

  $("#save-favorite").on("click", function () {
    var query = editor.getValue().trim();
    if (!query) {
      alert("Editor is empty — nothing to save.");
      return;
    }
    var name = window.prompt("Favorite name:", "");
    if (name === null) return;
    name = name.trim();
    if (!name) {
      alert("Name required.");
      return;
    }
    var list = getFavorites();
    list.push({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      name: name,
      query: query,
      created_at: new Date().toISOString()
    });
    saveFavorites(list);
    var $btn = $("#save-favorite");
    $btn.find("i").removeClass("fa-star-o").addClass("fa-star");
    setTimeout(function () {
      $btn.find("i").removeClass("fa-star").addClass("fa-star-o");
    }, 1200);
  });
}

function initShortcutsModal() {
  var isMac = navigator.userAgent.indexOf("Mac") > -1;
  var mod = isMac ? "\u2318" : "Ctrl";

  var shortcuts = [
    {
      group: "Editor",
      items: [
        { keys: [mod, "Enter"], desc: "Run query" },
        { keys: [mod, "E"], desc: "Explain query" },
      ],
    },
    {
      group: "Navigation",
      items: [
        { keys: [mod, "P"], desc: "Search schema objects" },
        { keys: [mod, "Shift", "H"], desc: "Search query history" },
        { keys: ["Ctrl", "Shift", "F"], desc: "Browse favorite queries" },
      ],
    },
  ];

  var html = "";
  shortcuts.forEach(function (g) {
    html += '<div class="shortcuts-group">';
    html += '<div class="shortcuts-group-title">' + g.group + "</div>";
    g.items.forEach(function (item) {
      html += '<div class="shortcut-row">';
      html += '<span class="shortcut-keys">';
      item.keys.forEach(function (k) {
        html += "<kbd>" + k + "</kbd>";
      });
      html += "</span>";
      html += '<span class="shortcut-desc">' + item.desc + "</span>";
      html += "</div>";
    });
    html += "</div>";
  });
  $(".shortcuts-body").html(html);

  function openShortcuts() {
    $("#shortcuts_overlay").show();
    $("#shortcuts_modal").show();
  }

  function closeShortcuts() {
    $("#shortcuts_overlay").hide();
    $("#shortcuts_modal").hide();
  }

  $("#shortcuts_btn").on("click", openShortcuts);
  $(".shortcuts-close").on("click", closeShortcuts);
  $("#shortcuts_overlay").on("click", closeShortcuts);

  $(document).on("keydown", function (e) {
    if (e.key === "Escape" && $("#shortcuts_modal").is(":visible")) {
      e.preventDefault();
      closeShortcuts();
    }
  });
}

function bindDatabaseObjectsFilter() {
  var filterTimeout = null;

  $("#filter_database_objects").on("keyup", function (e) {
    clearTimeout(filterTimeout);

    var val = $(this).val().trim();

    // Reset search on ESC
    if (e.keyCode == 27 || val == "") {
      resetObjectsFilter();
      return;
    }

    $(".clear-objects-filter").show();
    $(".schema:not(.expanded)").addClass("expanded search-expanded");
    $(".schema-group").addClass("expanded");

    filterTimeout = setTimeout(function () {
      filterObjectsByName(val);
    }, 200);
  });

  $(".clear-objects-filter").on("click", function (e) {
    resetObjectsFilter();
  });
}

function resetObjectsFilter() {
  $("#filter_database_objects").val("");
  $("#objects li.schema-item, #objects .schema-group").removeClass(
    "filter-hidden",
  );
  $(".clear-objects-filter").hide();
  $(".search-expanded").removeClass("expanded search-expanded");
}

function filterObjectsByName(query) {
  var lowerQuery = query.toLowerCase();

  $("#objects li.schema-item").each(function (idx, el) {
    var item = $(el);
    var name = String($(el).data("name") || "").toLowerCase();

    if (name.indexOf(lowerQuery) < 0) {
      item.addClass("filter-hidden");
    } else {
      item.removeClass("filter-hidden");
    }
  });

  // Hide schema-group headers when all their items are filtered out
  $("#objects .schema-group").each(function (idx, el) {
    var group = $(el);
    var hasVisible =
      group.find("li.schema-item:not(.filter-hidden)").length > 0;
    group.toggleClass("filter-hidden", !hasVisible);
  });
}

function getQuotedSchemaTableName(table) {
  if (typeof table === "string" && table.indexOf(".") > -1) {
    var schemaTableComponents = table.split(".");
    return [
      '"',
      schemaTableComponents[0],
      '"."',
      schemaTableComponents[1],
      '"',
    ].join("");
  }
  return table;
}

function bindContextMenus() {
  bindTableHeaderMenu();
  bindCurrentDatabaseMenu();

  $(".schema-group ul").each(function (id, el) {
    var group = $(el).data("group");

    if (group == "table") {
      $(el).contextmenu({
        target: "#tables_context_menu",
        scopes: "li.schema-table",
        onItem: function (context, e) {
          var el = $(e.target);
          var table = getQuotedSchemaTableName($(context[0]).data("id"));
          var action = el.data("action");
          performTableAction(table, action, el);
        },
      });
    }

    if (group == "view") {
      $(el).contextmenu({
        target: "#view_context_menu",
        scopes: "li.schema-view",
        onItem: function (context, e) {
          var el = $(e.target);
          var table = getQuotedSchemaTableName($(context[0]).data("id"));
          var action = el.data("action");
          performViewAction(table, action, el);
        },
      });
    }

    if (group == "materialized_view") {
      $(el).contextmenu({
        target: "#view_context_menu",
        scopes: "li.schema-materialized_view",
        onItem: function (context, e) {
          var el = $(e.target);
          var table = getQuotedSchemaTableName($(context[0]).data("id"));
          var action = el.data("action");
          performViewAction(table, action, el);
        },
      });
    }
  });
}

function toggleDatabaseSearch() {
  $("#current_database").toggle();
  $("#database_search").toggle();
}

function enableDatabaseSearch(data) {
  var input = $("#database_search");

  input.typeahead("destroy");

  input.typeahead({
    source: data,
    minLength: 0,
    items: "all",
    autoSelect: false,
    fitToElement: true,
  });

  input.typeahead("lookup").focus();

  input.on("focusout", function (e) {
    toggleDatabaseSearch();
    input.off("focusout");
  });
}

function bindInputResizeEvents() {
  var height = sessionStorage.getItem("input_height");
  if (height) {
    resizeInput(height);
    checkInputSize();
  }

  $("body").on("mousemove", onInputResize);
  $("body").on("mouseup", endInputResize);
  $("#input_resize_handler").on("mousedown", beginInputResize);
  $(window).on("resize", checkInputSize);
}

function checkInputSize() {
  var inputHeight = $("#input").height();
  var bodyHeight = $("#body").height();

  if (bodyHeight == 0 || inputHeight == 0) return;

  if (inputHeight > bodyHeight || bodyHeight - inputHeight < 200) {
    resizeInput(bodyHeight - 200);
  }
}

function resizeInput(height) {
  if (height < 100) height = 100;

  var diff = 50 + 12; // actions box + padding

  $("#input").height(height);
  $("#input .input-wrapper").height(height - diff);
  $("#custom_query").height(height - diff);
  $("#output").css("top", height + "px");

  if (editor) {
    editor.resize();
  }
}

function beginInputResize() {
  inputResizing = true;
  inputResizeOffset = $("#input").offset().top;

  $("html").css("cursor", "row-resize");
  $("#input_resize_handler").addClass("dragging");
}

function endInputResize() {
  if (!inputResizing) return;

  inputResizing = false;
  inputResizeOffset = null;

  $("html").css("cursor", "auto");
  $("#input_resize_handler").removeClass("dragging");

  // Save current settings for page reloads
  sessionStorage.setItem("input_height", $("#input").height());
}

function onInputResize(event) {
  if (!inputResizing) return;

  var computedHeight = event.clientY - inputResizeOffset;
  if (computedHeight < 150) computedHeight = 150;

  resizeInput(computedHeight);
}

function initContentModalEditors() {
  var theme =
    localStorage.getItem("pgport_theme") === "light"
      ? "ace/theme/tomorrow"
      : "ace/theme/tomorrow_night";

  window.contentViewEditor = contentViewEditor = ace.edit(
    "content_modal_ace_view",
  );
  contentViewEditor.setTheme(theme);
  contentViewEditor.getSession().setMode("ace/mode/json");
  contentViewEditor.setReadOnly(true);
  contentViewEditor.setShowPrintMargin(false);
  contentViewEditor.setFontSize(12);
  contentViewEditor.setHighlightActiveLine(false);
  contentViewEditor.renderer.setShowGutter(false);
  contentViewEditor.setOption("highlightGutterLine", false);
  contentViewEditor.setOption("useWorker", false);

  window.contentEditEditor = contentEditEditor = ace.edit(
    "content_modal_ace_edit",
  );
  contentEditEditor.setTheme(theme);
  contentEditEditor.getSession().setMode("ace/mode/json");
  contentEditEditor.setShowPrintMargin(false);
  contentEditEditor.setFontSize(12);
  contentEditEditor.renderer.setShowGutter(true);
  contentEditEditor.setOption("useWorker", false);
  contentEditEditor.getSession().setTabSize(2);
  contentEditEditor.getSession().setUseSoftTabs(true);
  var editorMode = localStorage.getItem("editorMode");
  if (editorMode) contentEditEditor.setKeyboardHandler(editorMode);
}

function bindContentModalEvents() {
  var contentModal = document.getElementById("content_modal");
  var currentCell = null;

  function resetModalToViewMode() {
    $("#content_modal_ace_edit").hide();
    $("#content_modal_ace_view").show();
    setTimeout(function () {
      if (contentViewEditor) contentViewEditor.resize();
    }, 0);
    $(".content-modal-action[data-action='copy']").show();
    $(".content-modal-action[data-action='edit']").show();
    $(".content-modal-save").hide();
    $(".content-modal-cancel").hide();
  }

  $(window).on("click", function (e) {
    if (e.target && !contentModal.contains(e.target)) {
      resetModalToViewMode();
      $("#content_modal").hide();
    }
  });

  $("#content_modal .content-modal-action").on("click", function () {
    switch ($(this).data("action")) {
      case "copy":
        copyToClipboard(contentViewEditor ? contentViewEditor.getValue() : "");
        break;
      case "close":
        resetModalToViewMode();
        $("#content_modal").hide();
        break;
      case "edit":
        var currentText = contentViewEditor ? contentViewEditor.getValue() : "";
        contentEditEditor.setValue(currentText, -1);
        contentEditEditor
          .getSession()
          .setMode(contentViewEditor.getSession().getMode().$id);
        $("#content_modal_ace_view").hide();
        $("#content_modal_ace_edit").show();
        $(".content-modal-action[data-action='copy']").hide();
        $(".content-modal-action[data-action='edit']").hide();
        $(".content-modal-save").show();
        $(".content-modal-cancel").show();
        setTimeout(function () {
          contentEditEditor.resize();
          contentEditEditor.focus();
        }, 10);
        break;
    }
  });

  $(".content-modal-cancel").on("click", function () {
    resetModalToViewMode();
  });

  $(".content-modal-save").on("click", function () {
    if (!currentCell) return;
    var newValue = contentEditEditor ? contentEditEditor.getValue() : "";
    apiCall(
      "post",
      "/tables/" + currentCell.table + "/cell",
      {
        column: currentCell.colName,
        ctid: currentCell.ctid,
        value: newValue,
      },
      function (data) {
        if (data && data.error) {
          alert("Error: " + data.error);
          return;
        }
        resetModalToViewMode();
        $("#content_modal").hide();
        showPaginatedTableContent();
      },
    );
  });

  $("#results").on("dblclick", "td > div", function () {
    var td = $(this).closest("td");
    var tr = $(this).closest("tr");
    var mode = $("#results").data("mode");
    var ctid = tr.data("ctid");
    var colName = td.data("col-name");
    var table = $("#results").data("table");

    var value = unescapeHtml($(this).html());
    if (!value) return;

    currentCell =
      mode === "browse" && ctid && table
        ? { table: table, colName: colName, ctid: ctid }
        : null;

    resetModalToViewMode();
    setModalContent(value);
    $(".content-modal-action[data-action='edit']").toggle(!!currentCell);
    $("#content_modal").show();
    setTimeout(function () {
      if (contentViewEditor) contentViewEditor.resize();
    }, 10);
  });
}

function bindInsertRowModal() {
  var modal = document.getElementById("insert_row_modal");

  function hideModal() {
    $("#insert_row_modal").hide();
    $("#insert_row_error").hide().text("");
    $("#insert_row_fields").empty();
  }

  $(window).on("click", function (e) {
    if (
      e.target &&
      !modal.contains(e.target) &&
      e.target.id !== "insert_row_btn"
    ) {
      hideModal();
    }
  });

  $(".insert-row-action").on("click", function () {
    hideModal();
  });

  $("#insert_row_cancel").on("click", function () {
    hideModal();
  });

  $("#insert_row_btn").on("click", function () {
    var tableName = $("#results").data("table");
    if (!tableName) return;

    getTableStructure(tableName, {}, function (data) {
      if (data.error) {
        alert("Error loading table structure: " + data.error);
        return;
      }

      var colNameIdx = data.columns.indexOf("column_name");
      var dataTypeIdx = data.columns.indexOf("data_type");
      var nullableIdx = data.columns.indexOf("is_nullable");
      var defaultIdx = data.columns.indexOf("column_default");

      var fieldsHtml = "";
      data.rows.forEach(function (row) {
        var colName = row[colNameIdx];
        var dataType = row[dataTypeIdx];
        var nullable = row[nullableIdx] === "YES";
        var colDefault = row[defaultIdx];
        var isSerial = colDefault && colDefault.indexOf("nextval(") === 0;

        fieldsHtml +=
          "<div class='insert-row-field' data-col='" +
          escapeAttr(colName) +
          "' data-nullable='" +
          nullable +
          "'>";
        fieldsHtml +=
          "<label>" +
          escapeHtml(colName) +
          "<span class='type-hint'>" +
          escapeHtml(dataType) +
          (isSerial ? " · auto" : "") +
          "</span></label>";
        fieldsHtml +=
          "<input type='text' placeholder='" +
          (isSerial ? "auto" : "") +
          "'" +
          (isSerial ? " disabled" : "") +
          " />";
        if (nullable) {
          fieldsHtml +=
            "<span class='null-toggle' title='Toggle NULL'>NULL</span>";
        }
        fieldsHtml += "</div>";
      });

      $("#insert_row_fields").html(fieldsHtml);
      $("#insert_row_error").hide().text("");
      $("#insert_row_modal").show();

      // Focus first non-disabled input
      $("#insert_row_fields input:not([disabled]):first").focus();

      // NULL toggle
      $("#insert_row_fields")
        .off("click", ".null-toggle")
        .on("click", ".null-toggle", function () {
          var toggle = $(this);
          var input = toggle.siblings("input");
          var isNull = toggle.hasClass("active");
          if (isNull) {
            toggle.removeClass("active");
            input.prop("disabled", false).removeClass("is-null");
          } else {
            toggle.addClass("active");
            input.prop("disabled", true).addClass("is-null").val("");
          }
        });
    });
  });

  $("#insert_row_save").on("click", function () {
    var tableName = $("#results").data("table");
    if (!tableName) return;

    var columns = [];
    var values = [];
    var valid = true;

    $("#insert_row_fields .insert-row-field").each(function () {
      var field = $(this);
      var colName = field.data("col");
      var input = field.find("input");
      var isNull = field.find(".null-toggle").hasClass("active");
      var isAutoField = input.prop("disabled") && !isNull; // serial/auto columns

      if (isAutoField) return; // skip — DB generates value

      if (isNull) {
        columns.push(colName);
        values.push(null);
      } else if (input.val() !== "") {
        // only include column if user provided a value; empty = let DB use default
        columns.push(colName);
        values.push(input.val());
      }
      // empty + no NULL toggle = omit column entirely → DB default applies
    });

    $("#insert_row_save").prop("disabled", true);

    insertTableRow(tableName, columns, values, function (data) {
      $("#insert_row_save").prop("disabled", false);
      if (data && data.error) {
        $("#insert_row_error").text(data.error).show();
        return;
      }
      hideModal();
      showPaginatedTableContent();
    });
  });
}

$(document).ready(function () {
  bindInputResizeEvents();
  initContentModalEditors();
  bindContentModalEvents();
  bindInsertRowModal();

  $("#table_content").on("click", function () {
    showTableContent();
  });
  $("#table_structure").on("click", function () {
    showTableStructure();
  });
  $("#table_indexes").on("click", function () {
    showTableIndexes();
  });
  $("#table_constraints").on("click", function () {
    showTableConstraints();
  });
  $("#table_history").on("click", function () {
    showQueryHistory();
  });
  $("#table_query").on("click", function () {
    showQueryPanel();
  });
  $("#table_connection").on("click", function () {
    showConnectionPanel();
  });
  $("#table_activity").on("click", function () {
    showActivityPanel();
  });

  $("#run").on("click", function () {
    runQuery();
  });

  $("#explain").on("click", function () {
    runExplain();
  });

  $("#analyze").on("click", function () {
    runAnalyze();
  });

  $("#format-query").on("click", function () {
    runFormatQuery();
  });

  $("#csv").on("click", function () {
    exportTo("csv");
  });

  $("#json").on("click", function () {
    exportTo("json");
  });

  $("#xml").on("click", function () {
    exportTo("xml");
  });

  $("#results_view").on("click", ".copy", function () {
    copyToClipboard($(this).parent().text());
  });

  $("#results").on("click", "tr", function (e) {
    $("#results tr.selected").removeClass();
    $(this).addClass("selected");
    openRowSidebar(this);
  });

  $("#objects").on("click", ".schema-group-title", function (e) {
    $(this).parent().toggleClass("expanded");
  });

  $("#objects").on("click", ".schema-name", function (e) {
    $(this).parent().toggleClass("expanded");
  });

  $("#objects").on("click", ".schema-item-toggle", function (e) {
    e.stopPropagation();
    var li = $(this).closest("li");
    var columnsUl = li.find(".schema-item-columns");

    li.toggleClass("expanded");

    if (li.hasClass("expanded") && columnsUl.children().length === 0) {
      var tableName = li.data("id");
      var tableType = li.data("type");
      columnsUl.html("<li class='schema-col-loading'>...</li>");

      getTableStructure(tableName, { type: tableType }, function (data) {
        columnsUl.empty();
        if (data && data.rows && data.rows.length > 0) {
          var colIdx = data.columns.indexOf("column_name");
          var typeIdx = data.columns.indexOf("data_type");
          data.rows.forEach(function (row) {
            var colName = colIdx >= 0 ? row[colIdx] : "";
            var colType = typeIdx >= 0 ? row[typeIdx] : "";
            columnsUl.append(
              "<li class='schema-col-item'>" +
                "<i class='fa fa-circle-o'></i>" +
                "<span class='schema-col-name'>" +
                colName +
                "</span>" +
                "<span class='schema-col-type'>" +
                colType +
                "</span>" +
                "</li>",
            );
          });
        } else {
          columnsUl.html("<li class='schema-col-empty'>no columns</li>");
        }
      });
    }
  });

  $("#objects").on("click", "li", function (e) {
    if ($(e.target).closest(".schema-item-toggle").length) return;
    if (
      $(this).hasClass("schema-col-item") ||
      $(this).hasClass("schema-col-loading") ||
      $(this).hasClass("schema-col-empty")
    )
      return;

    currentObject = {
      name: $(this).data("id"),
      type: $(this).data("type"),
    };

    $("#objects li").removeClass("active");
    $(this).addClass("active");
    $(".current-page").data("page", 1);
    $(".filters select, .filters input").val("");

    if (currentObject.type == "function") {
      sessionStorage.setItem("tab", "table_structure");
    } else {
      showTableInfo();
    }

    switch (sessionStorage.getItem("tab")) {
      case "table_content":
        showTableContent();
        break;
      case "table_structure":
        showTableStructure();
        break;
      case "table_constraints":
        showTableConstraints();
        break;
      case "table_indexes":
        showTableIndexes();
        break;
      default:
        showTableContent();
    }
  });

  $("#results").on("click", "a.row-action", function (e) {
    e.preventDefault();

    var action = $(this).data("action");
    var value = $(this).data("value");

    performRowAction(action, value);
  });

  $("#results").on("click", "th", function (e) {
    if (!$("#table_content").hasClass("selected")) return;

    var sortColumn = $(this).data("name");
    var sortOrder = $(this).data("order") === "ASC" ? "DESC" : "ASC";

    $(this).data("order", sortOrder);
    showTableContent(sortColumn, sortOrder);
  });

  $("#refresh_tables").on("click", function () {
    loadSchemas();
  });

  $("#rows_filter").on("submit", function (e) {
    e.preventDefault();
    $(".current-page").data("page", 1);

    var column = $(this).find("select.column").val();
    var filter = $(this).find("select.filter").val();
    var query = $.trim($(this).find("input").val());

    if (filter && filterOptions[filter].indexOf("DATA") > 0 && query == "") {
      alert("Please specify filter query");
      return;
    }

    showTableContent();
  });

  $(".change-limit").on("click", function () {
    var limit = prompt("Please specify a new rows limit", getRowsLimit());

    if (limit && limit >= 1) {
      $(".current-page").data("page", 1);
      setRowsLimit(limit);
      showTableContent();
    }
  });

  $("select.filter").on("change", function (e) {
    var val = $(this).val();

    if (["null", "not_null"].indexOf(val) >= 0) {
      $(".filters input").hide().val("");
    } else {
      $(".filters input").show();
    }
  });

  $("button.reset-filters").on("click", function () {
    $(".filters select, .filters input").val("");
    showTableContent();
  });

  // Automatically prefill the filter if it's not set yet
  $("select.column").on("change", function () {
    if ($("select.filter").val() == "") {
      $("select.filter").val("equal");
      $("#table_filter_value").focus();
    }
  });

  $("#pagination .next-page").on("click", function () {
    var current = $(".current-page").data("page");
    var total = $(".current-page").data("pages");

    if (total > current) {
      $(".current-page").data("page", current + 1);
      showPaginatedTableContent();

      if (current + 1 == total) {
        $(this).prop("disabled", "disabled");
      }
    }

    if (current > 1) {
      $(".prev-page").prop("disabled", "");
    }
  });

  $("#pagination .prev-page").on("click", function () {
    var current = $(".current-page").data("page");

    if (current > 1) {
      $(".current-page").data("page", current - 1);
      $(".next-page").prop("disabled", "");
      showPaginatedTableContent();
    }

    if (current == 1) {
      $(this).prop("disabled", "disabled");
    }
  });

  $("#current_database").on("click", function (e) {
    apiCall("get", "/databases", {}, function (resp) {
      toggleDatabaseSearch();
      enableDatabaseSearch(resp);
    });
  });

  $("#database_search").change(function (e) {
    var current = $("#database_search").typeahead("getActive");
    if (current && current == $("#database_search").val()) {
      apiCall("post", "/switchdb", { db: current }, function (resp) {
        if (resp.error) {
          alert(resp.error);
          return;
        }
        window.location.reload();
      });
    }
  });

  $("#edit_connection").on("click", function () {
    if (connected) {
      $("#close_connection_window").show();
    }

    showConnectionSettings();
  });

  $("#close_connection").on("click", function () {
    if (!confirm("Are you sure you want to disconnect?")) return;

    disconnect(function () {
      showConnectionSettings();
      resetTable();
      $("#close_connection_window").hide();
    });
  });

  $("#close_connection_window").on("click", function () {
    $("#connection_window").hide();
  });

  $("#connection_url").on("change", function () {
    if ($(this).val().indexOf("localhost") != -1) {
      $("#connection_ssl").val("disable");
    }
  });

  $("#pg_host").on("change", function () {
    var value = $(this).val();

    if (value.indexOf("localhost") != -1 || value.indexOf("127.0.0.1") != -1) {
      $("#connection_ssl").val("disable");
    }
  });

  $(".connection-group-switch button").on("click", function () {
    $(".connection-group-switch button").removeClass("active");
    $(this).addClass("active");

    switch ($(this).attr("data")) {
      case "scheme":
        $(".connection-scheme-group").show();
        $(".connection-standard-group").hide();
        $(".connection-ssh-group").hide();
        return;
      case "standard":
        $(".connection-scheme-group").hide();
        $(".connection-standard-group").show();
        $(".connection-ssh-group").hide();
        return;
      case "ssh":
        $(".connection-scheme-group").hide();
        $(".connection-standard-group").show();
        $(".connection-ssh-group").show();
        return;
    }
  });

  $("#connection_bookmarks").on("change", function (e) {
    var selection = $(this).val();

    var inputs = [
      $("#connection_form input[type='text']"),
      $("#connection_form input[type='password']"),
      $("#connection_ssl"),
    ];

    inputs.forEach(function (selector) {
      selector.val("").prop("disabled", selection == "" ? "" : "disabled");
    });
  });

  $("#save_connection_checkbox").on("change", function() {
    if ($(this).is(":checked")) {
      $(".save-connection-name").show().focus();
    } else {
      $(".save-connection-name").hide().val("");
    }
  });

  $("#saved_connections_list").on("click", ".conn-item", function(e) {
    if ($(e.target).hasClass("conn-item-delete")) return;
    loadSavedConnectionIntoForm($(this).data("id"));
  });

  $("#saved_connections_list").on("click", ".conn-item-delete", function(e) {
    e.stopPropagation();
    deleteSavedConnection($(this).data("id"));
    renderSavedConnections();
  });

  $("#recent_connections_list").on("click", ".conn-item", function() {
    loadRecentConnectionIntoForm($(this).data("id"));
  });

  $("#connection_form").on("submit", function (e) {
    e.preventDefault();

    var button = $(this).find("button.open-connection");
    var params = {};
    var bookmarkID = $.trim($("#connection_bookmarks").val());
    var saveChecked = $("#save_connection_checkbox").is(":checked");
    var saveName = $.trim($("#save_connection_name").val());
    var formData = null;

    if (bookmarkID != "") {
      params["bookmark_id"] = $("#connection_bookmarks").val();
    } else {
      params.url = getConnectionString();
      if (params.url.length == 0) {
        return;
      }

      if (saveChecked && saveName === "") {
        $("#save_connection_name").focus();
        return;
      }

      formData = getFormConnectionData();

      if ($(".connection-group-switch button.active").attr("data") == "ssh") {
        params["ssh"] = 1;
        params["ssh_host"] = $("#ssh_host").val();
        params["ssh_port"] = $("#ssh_port").val();
        params["ssh_user"] = $("#ssh_user").val();
        params["ssh_password"] = $("#ssh_password").val();
        params["ssh_key"] = $("#ssh_key").val();
        params["ssh_key_password"] = $("#ssh_key_password").val();
      }
    }

    $("#connection_error").hide();
    button.prop("disabled", true).text("Please wait...");

    apiCall("post", "/connect", params, function (resp) {
      button.prop("disabled", false).text("Connect");

      if (resp.error) {
        connected = false;
        $("#connection_error").text(resp.error).show();
      } else {
        if (formData && saveChecked && saveName) {
          saveConnectionToStorage(saveName, formData);
        }
        if (formData) {
          addRecentConnectionToStorage(formData);
        }
        $("#save_connection_checkbox").prop("checked", false);
        $(".save-connection-name").hide().val("");

        connected = true;
        loadSchemas();
        loadLocalQueries();

        $("#connection_window").hide();
        $("#current_database").text(resp.current_database);
        $("#main").show();
      }
    });
  });

  initEditor();
  initQueryTabs();
  addShortcutTooltips();
  bindDatabaseObjectsFilter();
  initFinder();
  initHistoryFinder();
  initFavoritesFinder();
  initShortcutsModal();
  bindRowSidebar();

  // Set session from the url
  var reqUrl = new URL(window.location);
  var sessionId = reqUrl.searchParams.get("session");

  if (sessionId && sessionId != "") {
    sessionStorage.setItem("session_id", sessionId);
    window.history.pushState({}, document.title, window.location.pathname);
  }

  getInfo(function (resp) {
    if (resp.error) {
      alert(
        "Unable to fetch app info: " +
          resp.error +
          ". Please reload the browser page.",
      );
      return;
    }

    appInfo = resp.app;
    appFeatures = resp.features;

    getConnection(function (resp) {
      if (resp.error) {
        connected = false;
        showConnectionSettings();
        $(".connection-actions").show();
        return;
      }

      connected = true;
      loadSchemas();
      loadLocalQueries();

      $("#current_database").text(resp.current_database);
      $("#main").show();

      if (!appFeatures.session_lock) {
        $(".connection-actions").show();
      }
    });
  });
});
