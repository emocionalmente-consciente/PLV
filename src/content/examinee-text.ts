// What the examinee reads. It's a DRAFT for a psychologist and a legal reviewer to confirm, and it
// holds no test content, so it can live in the repo. The Color wording follows the administration in
// the book, written anew: the examinee picks what draws the eye, never a favorite color.
export const EXAMINEE_CONSENT =
  'La persona que le envió este enlace le invita a contestar una evaluación psicológica con fines laborales. ' +
  'Su participación es voluntaria. Sus respuestas se cifran en este equipo, de modo que solo esa persona puede leerlas, y usted mismo se las hace llegar al terminar. ' +
  'Esta página no guarda sus respuestas en ningún servidor. Se conservan en este navegador hasta que usted las borre. ' +
  'Para ejercer sus derechos sobre sus datos, o si prefiere no continuar, comuníquese con quien le envió el enlace.';

export const EXAMINEE_INSTRUCTIONS = {
  general: [
    'Busque un lugar tranquilo, donde esté a solas y nadie le interrumpa.',
    'Conteste usted mismo, sin ayuda de otras personas ni de otros materiales.',
    'Si cierra esta página, podrá continuar más tarde desde el mismo enlace y en el mismo navegador.',
    'Si necesita que las pruebas se le presenten de otra forma, por ejemplo por una discapacidad visual, avise a quien le envió el enlace antes de empezar.',
  ],
  color: [
    'Use la pantalla con brillo medio y sin filtro de luz nocturna o modo de lectura. Evite que le dé el sol directamente.',
    'Verá ocho colores. Señale el que más le atrae a la vista en este momento.',
    'No se trata de elegir su color favorito ni el que más le gusta. No lo relacione con ropa, autos ni ningún otro objeto: fíjese solo en el color.',
    'Cada color que señale desaparecerá. Siga eligiendo entre los que quedan, sin pensarlo demasiado.',
    'Después de una pausa, volverá a hacer lo mismo. No intente recordar ni repetir su primera elección, ni tampoco cambiarla a propósito.',
  ],
  ci: [
    'Verá una serie de preguntas. Cada una se muestra como una imagen.',
    'Elija la opción correcta o, en las series de números, escriba el número que sigue.',
    'Puede dejar una pregunta sin contestar y volver a ella antes de terminar la prueba.',
  ],
  ce: ['Verá una serie de situaciones, cada una con tres opciones.', 'Elija la opción que describe mejor lo que usted haría o piensa. No hay respuestas buenas ni malas.', 'Es necesario contestar todas las preguntas.'],
};
