import { Plugin } from 'vite';

type UserOptions = Partial<Config>;
type Config = {
    /**
     * 初始化时是否监听手势返回，默认值为`true`
     */
    initialValue: boolean;
    /**
     * 是否阻止默认的回退事件，默认为 false
     */
    preventDefault: boolean;
    /**
     * 阻止次数，默认是 `1`
     */
    frequency: number;
    /**
     * 调试模式
     */
    debug: boolean;
    /**
     * 页面回退时触发
     */
    onPageBack?: (params: BackParams) => void;
};
type BackParams = {
    /**
     * 当前页面路径
     */
    page: string;
};

declare function MpBackPlugin(userOptions?: UserOptions): Plugin;

export { MpBackPlugin as default };
