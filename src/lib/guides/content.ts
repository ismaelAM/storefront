export interface BuyingGuide {
  slug: string;
  title: string;
  intro: string;
  sections: { title: string; paragraphs: string[] }[];
  sources: { title: string; url: string }[];
}

export const BUYING_GUIDES: readonly BuyingGuide[] = [
  {
    slug: "como-empezar-pokemon-tcg",
    title: "Cómo empezar en Pokémon TCG",
    intro:
      "Para empezar en Pokémon TCG, decide primero si quieres coleccionar, aprender a jugar o preparar una baraja para competir.",
    sections: [
      {
        title: "Decide qué quieres hacer con tus cartas",
        paragraphs: [
          "Si te interesan las ilustraciones o un Pokémon concreto, puedes organizar tu colección alrededor de ese objetivo. Si quieres jugar, tu primera compra debe permitirte preparar una partida: el JCC Pokémon habitual enfrenta a dos personas, cada una con una baraja de 60 cartas.",
          "Puedes combinar ambos intereses, pero conviene distinguirlos al repartir tu presupuesto. Una carta que te encanta para la carpeta no tiene por qué encajar en la estrategia de tu baraja.",
        ],
      },
      {
        title: "Elige un punto de partida completo",
        paragraphs: [
          "Para aprender desde cero con otra persona, Academia de Combate reúne tres barajas de 60 cartas, un tablero y materiales de aprendizaje. Es una opción que permite concentrarse en las reglas antes de construir una baraja propia.",
          "Si ya tienes alguien con quien jugar, una baraja preconstruida puede ser un comienzo más directo. Lee el contenido del producto y comprueba qué accesorios incluye. Para jugadores más pequeños, Mi Primer Combate utiliza minibarajas y reglas simplificadas: está pensado como introducción, por lo que conviene distinguirlo del formato habitual.",
        ],
      },
      {
        title: "Aprende antes de ampliar",
        paragraphs: [
          "Juega varias partidas con la misma baraja. Observa qué te cuesta: conseguir Energía, preparar una evolución, encontrar cartas concretas o decidir cuándo atacar. Esa información te ayudará a elegir cambios con un propósito.",
          "Los tutoriales oficiales y el tutorial interactivo de JCC Pokémon Live permiten practicar los fundamentos. Cuando entiendas el funcionamiento de tu baraja, compara su lista con las cartas que ya tienes antes de comprar más.",
        ],
      },
      {
        title: "Prepara tu siguiente compra",
        paragraphs: [
          "Haz una lista breve: producto para aprender, protección adecuada y, más adelante, cartas para una estrategia definida. Reserva una parte del presupuesto para guardar y transportar las cartas.",
          "Si quieres participar en eventos, consulta primero sus reglas y el formato anunciado. La utilidad de una carta para jugar en casa y su admisión en una competición son cuestiones que debes comprobar por separado.",
        ],
      },
    ],
    sources: [
      {
        title: "Pokémon: introducción al Juego de Cartas Coleccionables",
        url: "https://parents.pokemon.com/es-es/trading-card-game/",
      },
      {
        title: "Pokémon: Academia de Combate",
        url: "https://tcg.pokemon.com/es-es/battleacademy/",
      },
    ],
  },
  {
    slug: "como-elegir-fundas-cartas",
    title: "Cómo elegir fundas para tus cartas",
    intro:
      "Para elegir fundas, comprueba el tamaño compatible, cómo vas a usar las cartas y cuánto espacio ocuparán después de enfundarlas.",
    sections: [
      {
        title: "Empieza por las medidas",
        paragraphs: [
          "El nombre del juego ayuda, pero la medida compatible es el dato decisivo. Además, algunos fabricantes indican las dimensiones de la funda y otros destacan el tamaño de carta que admite: no son lo mismo.",
          "Por ejemplo, Gamegenic especifica que sus Prime Sleeves miden 66 × 91 mm y admiten cartas de hasta 64 × 89 mm. Su guía distingue también el formato japonés: cartas de 59 × 86 mm y fundas de 62 × 89 mm. Utiliza estos números como ejemplos de lectura, no como medidas universales para todas las marcas.",
          "En juegos de mesa, comprueba cada tipo de carta: una misma caja puede necesitar varios tamaños.",
        ],
      },
      {
        title: "Piensa en el uso diario",
        paragraphs: [
          "Para una baraja que vas a barajar con frecuencia, revisa el acabado, el grosor y el reverso. Si puedes comparar una muestra, fíjate en cómo se sujetan las cartas y en si lees cómodamente sus textos.",
          "Para una colección, considera también la compatibilidad con los bolsillos de tu álbum. Elige el color o la ilustración después de confirmar las medidas. Si vas a competir, consulta las condiciones del evento antes de elegir fundas con reverso transparente o diseños diferentes.",
        ],
      },
      {
        title: "Decide si necesitas doble funda",
        paragraphs: [
          "El doble enfundado combina una funda interior con otra exterior compatible. Gamegenic, por ejemplo, ofrece un pack con 100 fundas interiores y 100 exteriores para proteger hasta 100 cartas.",
          "Comprueba que ambas capas estén diseñadas para encajar. No fuerces una carta dentro de una funda demasiado estrecha. Antes de enfundar toda la baraja, prueba unas pocas cartas y verifica que puedes introducirlas y retirarlas sin doblarlas.",
        ],
      },
      {
        title: "Cuenta cartas y revisa la caja",
        paragraphs: [
          "Calcula cuántas cartas quieres proteger y deja algunas fundas de repuesto del mismo modelo. Lee la cantidad del paquete: un pack de doble enfundado con 200 fundas puede cubrir 100 cartas, porque cada carta utiliza dos.",
          "Por último, comprueba la capacidad de tu caja con la baraja ya enfundada. Medidas, cantidad, compatibilidad entre capas y espacio de almacenamiento deben quedar resueltos antes de comprar.",
        ],
      },
    ],
    sources: [
      {
        title: "Gamegenic: especificaciones de Prime Sleeves",
        url: "https://www.gamegenic.com/product/prime-sleeves/",
      },
      {
        title: "Gamegenic: guía de tamaños de fundas (PDF)",
        url: "https://www.gamegenic.com/wp-content/uploads/Gamegenic_Sleeve-Size-Guide_2022.pdf",
      },
      {
        title: "Gamegenic: Prime Double Sleeving Pack 100",
        url: "https://www.gamegenic.com/product/double-sleeving-pack-100/",
      },
    ],
  },
  {
    slug: "como-elegir-juego-mesa-dos",
    title: "Cómo elegir un juego de mesa para dos",
    intro:
      "Para elegir un juego de mesa para dos, busca una experiencia que encaje con vuestro tiempo, vuestra forma de competir y las ganas que tengáis de aprender reglas.",
    sections: [
      {
        title: "Comprueba cómo funciona con dos personas",
        paragraphs: [
          "Que una caja indique «2–4 jugadores» confirma que admite dos, pero no explica por sí solo cómo se desarrolla esa partida. Lee el reglamento y comprueba si cambia la preparación, aparecen participantes automáticos o se utilizan reglas específicas.",
          "Un juego creado para dos también merece esa revisión. Catan: El Duelo, por ejemplo, es una versión de cartas de Catan diseñada para dos jugadores, según Devir. El nombre de una familia de juegos no basta para identificar las características de cada edición.",
        ],
      },
      {
        title: "Elige el tipo de interacción",
        paragraphs: [
          "Pensad qué os apetece hacer durante la partida. Un juego competitivo os enfrenta por un objetivo; uno cooperativo os invita a resolver un reto compartido.",
          "Dentro de los competitivos, revisad si podéis quitar recursos, bloquear opciones o perjudicar directamente al rival. Algunas personas disfrutan esa tensión; otras prefieren desarrollar su propio plan. Mirad ejemplos de turnos en el reglamento para saber qué decisiones se repiten, más allá del tema o las ilustraciones.",
        ],
      },
      {
        title: "Ajusta duración y aprendizaje",
        paragraphs: [
          "Cuenta también el tiempo de explicar, preparar y recoger. Para una primera partida, reserva margen para consultar dudas.",
          "Comprueba si la duración cambia según el modo. La web oficial de CATAN diferencia, para Rivals for CATAN, una partida introductoria de unos 30 minutos, modos temáticos de 45–60 y un duelo de 60–75. Es un buen ejemplo de por qué conviene leer el modo concreto y confirmar la edición que vas a comprar.",
        ],
      },
      {
        title: "Revisa los detalles prácticos",
        paragraphs: [
          "Antes de decidir, comprueba el idioma de las cartas y del reglamento, el espacio necesario en la mesa y si el producto es un juego independiente o una expansión.",
          "Si vais a jugar a menudo, valorad qué os animará a repetir: escenarios, objetivos variables o nuevas decisiones con las mismas reglas. Si buscáis una primera experiencia, priorizad una explicación que ambos podáis seguir. Un juego adecuado es aquel para el que encontráis tiempo y ganas de volver a sentaros.",
        ],
      },
    ],
    sources: [
      {
        title: "Devir: Catan El Duelo",
        url: "https://devir.es/catan-el-duelo",
      },
      {
        title: "CATAN: Rivals for CATAN y duración de sus modos",
        url: "https://www.catan.com/rivals-catan",
      },
    ],
  },
];

export function getBuyingGuide(slug: string): BuyingGuide | undefined {
  return BUYING_GUIDES.find((guide) => guide.slug === slug);
}

export function isBuyingGuideRoute(country: string, locale: string): boolean {
  return country === "es" && locale === "es";
}
