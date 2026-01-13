export type Language = "es" | "en";

export interface TranslationDict {
  [key: string]: string | TranslationDict;
}

export const translations: Record<Language, TranslationDict> = {
  es: {
    editor: {
      hide: "Ocultar",
      edit: "Editar",
      name: "Nombre",
      description: "Descripción",
      image: "Imagen",
      change: "Cambiar",
      removeImage: "Quitar imagen",
      uploadImage: "Subir imagen",
      duration: "Duración",
      unit: "Unidad",
    },
    mapView: {
      byDays: "Por días",
      byDaysColors: "Por días (colores)",
      focusDay: "Día {day} (otros tenue)",
      focusDayButton: "Enfocar día (otros tenue)",
      onlyDay: "Solo Día {day}",
      onlyDayButton: "Solo día",
    },
    common: {
      info: "Info",
      settings: "Ajustes",
      close: "Cerrar",
      add: "Añadir",
      search: "Buscar",
      delete: "Eliminar",
      remove: "Quitar",
      yes: "sí",
      no: "no",
      export: "Exportar",
      view: "Vista",
      importing: "Importando…",
      import: "Importar",
      day: "Día",
      previousDay: "Día anterior",
      nextDay: "Día siguiente",
      selectDay: "Seleccionar día",
      previousActivity: "Actividad anterior",
      nextActivity: "Actividad siguiente",
      centerCurrentActivity: "Centrar actividad actual",
    },
    info: {
      title: "Sobre este proyecto",
      cta: "¿Quieres contactarme o saber más?",
      sendSuggestions: "Enviar sugerencias",
      watchOnYouTube: "Ver en YouTube",
      openLinkedIn: "Abrir LinkedIn",
      videoTitle: "Video",
      aboutText:
        "Este es un proyecto personal que hice en un fin de semana para poder planificar mejor mi viaje a tokio,\n" +
        "sientete libre de usarlo para planear tus viajes, me ha ayudado mucho y quería compartirlo con la comunidad,\n" +
        "si quieres aportar a este proyecto me puedes escribir dando sugerencias o colaborando en el proyecto open source.",
    },
    settings: {
      title: "Valores por defecto",
      closeAria: "Cerrar ajustes",
      defaultAttractionDuration: "Duración Atracción (min)",
      defaultAirportDuration: "Duración Aeropuerto (min)",
      dayStart: "Inicio día",
      dayEnd: "Fin día",
      defaultMode: "Modo por defecto (tramos nuevos)",
      defaultsHint:
        "Estos valores se usan al crear nuevas actividades/aeropuertos y para el horario inicial de nuevos días.",
      clearData: "Borrar datos",
      clearDataConfirm:
        "Esto borrará todos los datos guardados (lugares, plan y ajustes) en este navegador.\n\n¿Continuar?",
      language: "Idioma",
      languageEs: "Español",
      languageEn: "Inglés",
    },
    travelMode: {
      driving: "🚗 Carro",
      walking: "🚶 A pie",
      cycling: "🚲 Bici",
      transit: "🚌 Transporte",
      transitSimulated: "🚌 Transporte (simulado)",
      flight: "✈ Avión",
      flightEstimated: "✈ Avión (estimado)",
    },
    place: {
      attraction: "Atracción",
      hotel: "Hotel",
      airport: "Aeropuerto",
      unnamed: "Sin nombre",
    },
    placeSearch: {
      label: "Buscar lugar",
      placeholder: "Ej: Museo del Prado, Sagrada Familia...",
      searching: "Buscando...",
      hint: "Escribe al menos 3 caracteres para buscar.",
    },
    planner: {
      needTwoPoints: "Para dibujar la ruta, añade al menos 2 puntos (hotel o atracción).",
      emptyPlacesHint: "Busca arriba y selecciona un resultado para añadirlo.",
      needAttractionToPlan: "Añade al menos una Atracción para empezar a planificar por días.",
      clickOnMap: "Clic en mapa",
      clickOnMapToAdd: "Clic en el mapa para añadir {kind}.",
      goBy: "Ir en:",
      routeButton: "Ruta",
      optimizeDayButton: "Optimizar",
      optimizingDayButton: "Optimizando…",
      optimizeDayHint: "Mantiene fija la primera y la última parada, y reordena las intermedias para minimizar el tiempo de viaje.",
      dayMenuLabel: "Opciones del día",
      dayMenuOptimize: "Optimizar ruta del día",
      dayMenuDelete: "Eliminar día",
      dragToReorder: "Arrastrar para reordenar",
      travelModeToThis: "Modo de viaje hacia esta ubicación",
      etaTitle: "Horario estimado (inicio–fin)",
      viewRouteInstructions: "Ver instrucciones de la ruta",
      quickNotesPlaceholder: "Notas rápidas, horarios, links, etc.",
      dayStartTitle: "Hora inicio",
      dayEndTitle: "Hora fin",
      deleteDayTitle: "Eliminar día",
      dragActivitiesHere: "Arrastra actividades aquí.",
      ariaDayStartTime: "Hora inicio Día {day}",
      ariaDayEndTime: "Hora fin Día {day}",
      ariaDeleteDay: "Eliminar Día {day}",
      confirmDeleteDay:
        "Este día tiene {count} elemento(s). Si continúas, se eliminarán del plan y del mapa.\n\n¿Eliminar el Día {day}?",
      confirmRemovePlace: "¿Quitar \"{name}\"?\n\nSe eliminará del plan y del mapa.",
      unnamedItem: "este elemento",
      addDay: "+ Añadir día",
      noActivities: "Sin actividades",
    },
    toasts: {
      importedJson: "Importado (JSON)",
      importedJsonLegacy: "Importado (JSON legado)",
      importInvalidJson: "No se pudo importar (JSON inválido)",
      dataCleared: "Datos borrados. Todo volvió a valores por defecto.",
      deletedWithName: "\"{name}\" eliminado",
      addedToDay: "{kind}: {name} añadida al Día {day}",
      imageUpdated: "Imagen actualizada",
      imageUploadFailed: "No se pudo cargar la imagen",
      imageRemoved: "Imagen eliminada",
      dayDeleted: "Día {day} eliminado",
      dayOptimized: "Día {day} optimizado",
      optimizeFailed: "No se pudo calcular la ruta óptima para este día",
      optimizeNeedAtLeast3: "Para optimizar, el día debe tener al menos 3 paradas (primera y última fijas)",
      optimizeNoChanges: "No hubo cambios: ya estaba (casi) óptimo",
    },
    routing: {
      loadingInstructions: "Cargando instrucciones…",
      noRouteInfo: "No se pudo cargar la información de la ruta.",
      noDetailedInstructions: "Sin instrucciones detalladas para este tramo.",
      flightLegHint:
        "Este tramo se dibuja como una línea recta entre ambos aeropuertos (sin instrucciones de carretera).",
      estimatedDuration: "Duración estimada: {min} min",
      transitSimulatedNote:
        "Nota: “Transporte” está simulado (OSRM no provee instrucciones reales de transporte público).",
      maneuvers: {
        depart: "Sal",
        arrive: "Llega",
        turn: "Gira",
        continue: "Continúa",
        roundabout: "Entra a la rotonda",
        exitRoundabout: "Sal de la rotonda",
        merge: "Incorpórate",
        fork: "Toma la bifurcación",
        endOfRoad: "Al final de la vía",
        newName: "Continúa (cambia de nombre)",
        step: "Paso",
      },
    },
    export: {
      jsonReimport: "JSON (para reimportar)",
      csvExcel: "CSV (Excel / Google Sheets)",
    },
  },
  en: {
    editor: {
      hide: "Hide",
      edit: "Edit",
      name: "Name",
      description: "Description",
      image: "Image",
      change: "Change",
      removeImage: "Remove image",
      uploadImage: "Upload image",
      duration: "Duration",
      unit: "Unit",
    },
    mapView: {
      byDays: "By days",
      byDaysColors: "By days (colors)",
      focusDay: "Day {day} (others dimmed)",
      focusDayButton: "Focus day (others dimmed)",
      onlyDay: "Only Day {day}",
      onlyDayButton: "Only day",
    },
    common: {
      info: "Info",
      settings: "Settings",
      close: "Close",
      add: "Add",
      search: "Search",
      delete: "Delete",
      remove: "Remove",
      yes: "yes",
      no: "no",
      export: "Export",
      view: "View",
      importing: "Importing…",
      import: "Import",
      day: "Day",
      previousDay: "Previous day",
      nextDay: "Next day",
      selectDay: "Select day",
      previousActivity: "Previous activity",
      nextActivity: "Next activity",
      centerCurrentActivity: "Center current activity",
    },
    info: {
      title: "About this project",
      cta: "Want to contact me or learn more?",
      sendSuggestions: "Send suggestions",
      watchOnYouTube: "Watch on YouTube",
      openLinkedIn: "Open LinkedIn",
      videoTitle: "Video",
      aboutText:
        "This is a personal project I built over a weekend to plan my trip to Tokyo better.\n" +
        "Feel free to use it to plan your own trips — it helped me a lot and I wanted to share it with the community.\n" +
        "If you want to contribute, you can message me with suggestions or collaborate on the open-source project.",
    },
    settings: {
      title: "Default values",
      closeAria: "Close settings",
      defaultAttractionDuration: "Attraction duration (min)",
      defaultAirportDuration: "Airport duration (min)",
      dayStart: "Day start",
      dayEnd: "Day end",
      defaultMode: "Default mode (new legs)",
      defaultsHint: "These values are used for new activities/airports and the initial schedule of new days.",
      clearData: "Clear data",
      clearDataConfirm:
        "This will remove all saved data (places, plan and settings) in this browser.\n\nContinue?",
      language: "Language",
      languageEs: "Spanish",
      languageEn: "English",
    },
    travelMode: {
      driving: "🚗 Car",
      walking: "🚶 Walk",
      cycling: "🚲 Bike",
      transit: "🚌 Transit",
      transitSimulated: "🚌 Transit (simulated)",
      flight: "✈ Flight",
      flightEstimated: "✈ Flight (estimated)",
    },
    place: {
      attraction: "Attraction",
      hotel: "Hotel",
      airport: "Airport",
      unnamed: "Unnamed",
    },
    placeSearch: {
      label: "Search place",
      placeholder: "e.g. Prado Museum, Sagrada Familia...",
      searching: "Searching...",
      hint: "Type at least 3 characters to search.",
    },
    planner: {
      needTwoPoints: "To draw a route, add at least 2 points (hotel or attraction).",
      emptyPlacesHint: "Search above and pick a result to add it.",
      needAttractionToPlan: "Add at least one Attraction to start planning by days.",
      clickOnMap: "Click on map",
      clickOnMapToAdd: "Click on the map to add {kind}.",
      goBy: "Go via:",
      routeButton: "Route",
      optimizeDayButton: "Optimize",
      optimizingDayButton: "Optimizing…",
      optimizeDayHint: "Keeps the first and last stop fixed, and reorders the intermediate stops to minimize travel time.",
      dayMenuLabel: "Day options",
      dayMenuOptimize: "Optimize day route",
      dayMenuDelete: "Delete day",
      dragToReorder: "Drag to reorder",
      travelModeToThis: "Travel mode to this location",
      etaTitle: "Estimated schedule (start–end)",
      viewRouteInstructions: "View route instructions",
      quickNotesPlaceholder: "Quick notes, times, links, etc.",
      dayStartTitle: "Start time",
      dayEndTitle: "End time",
      deleteDayTitle: "Delete day",
      dragActivitiesHere: "Drag activities here.",
      ariaDayStartTime: "Day {day} start time",
      ariaDayEndTime: "Day {day} end time",
      ariaDeleteDay: "Delete Day {day}",
      confirmDeleteDay:
        "This day has {count} item(s). If you continue, they will be removed from the plan and the map.\n\nDelete Day {day}?",
      confirmRemovePlace: "Remove \"{name}\"?\n\nIt will be removed from the plan and the map.",
      unnamedItem: "this item",
      addDay: "+ Add day",
      noActivities: "No activities",
    },
    toasts: {
      importedJson: "Imported (JSON)",
      importedJsonLegacy: "Imported (legacy JSON)",
      importInvalidJson: "Could not import (invalid JSON)",
      dataCleared: "Data cleared. Everything is back to default values.",
      deletedWithName: "\"{name}\" deleted",
      addedToDay: "{kind}: {name} added to Day {day}",
      imageUpdated: "Image updated",
      imageUploadFailed: "Could not load the image",
      imageRemoved: "Image removed",
      dayDeleted: "Day {day} deleted",
      dayOptimized: "Day {day} optimized",
      optimizeFailed: "Could not calculate an optimal route for this day",
      optimizeNeedAtLeast3: "To optimize, the day must have at least 3 stops (first and last are fixed)",
      optimizeNoChanges: "No changes: it was already (nearly) optimal",
    },
    routing: {
      loadingInstructions: "Loading instructions…",
      noRouteInfo: "Could not load route information.",
      noDetailedInstructions: "No detailed instructions for this leg.",
      flightLegHint: "This leg is drawn as a straight line between both airports (no road instructions).",
      estimatedDuration: "Estimated duration: {min} min",
      transitSimulatedNote:
        "Note: “Transit” is simulated (OSRM does not provide real public transport instructions).",
      maneuvers: {
        depart: "Depart",
        arrive: "Arrive",
        turn: "Turn",
        continue: "Continue",
        roundabout: "Enter the roundabout",
        exitRoundabout: "Exit the roundabout",
        merge: "Merge",
        fork: "Take the fork",
        endOfRoad: "At the end of the road",
        newName: "Continue (road name changes)",
        step: "Step",
      },
    },
    export: {
      jsonReimport: "JSON (for re-import)",
      csvExcel: "CSV (Excel / Google Sheets)",
    },
  },
};

function getPath(dict: TranslationDict, path: string): string | undefined {
  const parts = path.split(".");
  let cur: string | TranslationDict | undefined = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) {
      cur = (cur as TranslationDict)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_m, k) => (vars[k] == null ? `{${k}}` : String(vars[k])));
}

export function createT(language: Language) {
  return (key: string, vars?: Record<string, string | number>) => {
    const v = getPath(translations[language], key) ?? getPath(translations.en, key) ?? key;
    return interpolate(v, vars);
  };
}


