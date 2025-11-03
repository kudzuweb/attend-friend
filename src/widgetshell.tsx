import React from 'react';

type WidgetShellProps = {
    children?: React.ReactNode;
};

export function WidgetShell({ children }: WidgetShellProps) {
    return (<div className="widget-shell">
        <div className='widget-shell-inner'>{children}</div>
    </div>
    );
};
