import { useParams } from 'react-router';
import { COLOR_NAMES } from '../../domain/norms/norms';
import type { ColorResult } from '../../data/schemas';
import { type ProtocolSide, protocolOf } from './report';
import { ResultFrame, ResultMissing } from './ResultParts';
import { useResult } from './useResult';

const marksText = (count: number): string => '!'.repeat(count);

function Cells({ values, className, label }: { values: readonly string[]; className: string; label: string }) {
  return (
    <tr className={className}>
      <th scope="row" className="visually-hidden">
        {label}
      </th>
      {values.map((value, i) => (
        <td key={i}>{value}</td>
      ))}
    </tr>
  );
}

function Digits({ side, label }: { side: ProtocolSide; label: string }) {
  return (
    <tr className="protocol-digits">
      <th scope="row" className="visually-hidden">
        {label}
      </th>
      {side.digits.map((digit, i) => (
        <td key={i} data-color={digit} title={COLOR_NAMES[digit]}>
          {digit}
        </td>
      ))}
    </tr>
  );
}

export function ProtocolTable({ colorResult }: { colorResult: ColorResult }) {
  const { serie1, serie2 } = protocolOf(colorResult);
  return (
    <table className="protocol">
      <caption className="visually-hidden">Protocolo del test de colores</caption>
      <tbody>
        <Cells label="Letras de la serie 1" className="protocol-letters" values={serie1.letters} />
        <Cells label="Signos de admiración de la serie 1" className="protocol-marks" values={serie1.marks.map(marksText)} />
        <Cells label="Funciones de la serie 1" className="protocol-signs" values={serie1.signs} />
        <Digits label="Serie 1" side={serie1} />
        <Digits label="Serie 2" side={serie2} />
        <Cells label="Funciones de la serie 2" className="protocol-signs" values={serie2.signs} />
        <Cells label="Signos de admiración de la serie 2" className="protocol-marks" values={serie2.marks.map(marksText)} />
        <Cells label="Letras de la serie 2" className="protocol-letters" values={serie2.letters} />
      </tbody>
    </table>
  );
}

export function ProtocolPage() {
  const { sessionId = '' } = useParams();
  const result = useResult(sessionId);
  if (!result) return <ResultMissing loading={result === undefined} />;
  const { colorResult } = result.record;
  if (!colorResult) {
    return (
      <ResultFrame result={result} title="Protocolo">
        <p className="muted">Esta sesión no tiene test de colores.</p>
      </ResultFrame>
    );
  }
  return (
    <ResultFrame result={result} title="Protocolo">
      <ProtocolTable colorResult={colorResult} />
    </ResultFrame>
  );
}
