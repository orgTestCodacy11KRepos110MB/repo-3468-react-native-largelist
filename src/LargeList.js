/*
 * @Author: 石破天惊
 * @email: shanshang130@gmail.com
 * @Date: 2021-10-26 16:51:21
 * @LastEditTime: 2021-12-16 20:03:49
 * @LastEditors: 石破天惊
 * @Description:
 */

import React from "react";
import {
  measure,
  runOnJS,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
} from "react-native-reanimated";
import { SpringScrollView } from "react-native-spring-scrollview";
import Reanimated from "react-native-reanimated";
import { Dimensions, Text } from "react-native";
import { Item } from "./Item";
import { TouchableOpacity } from "react-native-gesture-handler";

const trashOffset = -10000;
export interface ItemDataStruct {
  key?: string;
  reuseType?: string;
  data: any;
  height?: number;
}
export interface SectionDataStruct {
  key?: string;
  reuseType?: string;
  items: ItemDataStruct[];
  height?: number;
}
export interface LargeListProps {
  sections: SectionDataStruct[];
  renderSectionHeader: (section: Section) => JSX.Element;
  renderItem: (item: ItemDataStruct, index: number, section: Section) => JSX.Element;
  poolSizeForReuseType: { ["string"]: number };
}

interface LargeListCoreProps extends LargeListProps {
  keyMapping: Reanimated.SharedValue<{ [string]: number }>;
  trashItems: Reanimated.SharedValue<{ sectionIndex: number, itemIndex: number }[]>;
  trashSections: Reanimated.SharedValue<{ sectionIndex: number, itemIndex: number }[]>;
  availableItems: Reanimated.SharedValue<{ sectionIndex: number, itemIndex: number }[]>;
  availableItemIndexes: Reanimated.SharedValue<{ sectionIndex: number, itemIndex: number }[]>;
}

export const LargeList = React.forwardRef((props: LargeListProps, ref) => {
  const [sharedValues] = React.useState({
    size: { width: useSharedValue(0), height: useSharedValue(0) },
    contentSize: { width: useSharedValue(0), height: useSharedValue(0) },
    contentOffset: { x: useSharedValue(0), y: useSharedValue(0) },
    contentInsets: {
      top: useSharedValue(0),
      bottom: useSharedValue(0),
      left: useSharedValue(0),
      right: useSharedValue(0),
    },
    dragging: useSharedValue(false),
    vIndicatorOpacity: useSharedValue(0),
    hIndicatorOpacity: useSharedValue(0),
    refreshAnimating: useSharedValue(false),
    refreshHeaderRef: React.useRef(),
    refreshStatus: useSharedValue("waiting"),
    loadMoreAnimating: useSharedValue(false),
    loadMoreFooterRef: React.useRef(),
    loadMoreStatus: useSharedValue("waiting"),
    panRef: React.useRef(),
    focus: useSharedValue(false),
    currentPage: useSharedValue(0),
    refreshingInner: useSharedValue(false),
    loadingMoreInner: useSharedValue(false),
    keyboardOffset: useSharedValue(0),
  });
  const combined = { ...sharedValues, ...props };
  return <LargeListClass ref={ref} {...combined} />;
});

class LargeListClass extends React.PureComponent {
  render() {
    return <LargeListCore {...this.props} />;
  }
}

const LargeListCore = (props: LargeListCoreProps) => {
  const heightSummary = useSharedValue({});
  const [trashItems] = React.useState([]);
  const [availableItems] = React.useState([]);
  const [refs] = React.useState([]);
  const gotItemHeightCount = useSharedValue(0);
  const sumGotHeight = useSharedValue(0);
  let itemCount = 0;

  //#region  计算当前需要渲染的起始和结束index
  const [elements] = React.useState([]);
  const screenHeight = Dimensions.get("window").height;
  const extraRenderRate = 0.5;
  if (elements.length === 0) {
    let elementId = 0;
    let initItemCount = (screenHeight * 2) / 40;
    let heightSum = 0;
    props.sections.forEach((section, sectionIndex) => {
      itemCount += section.items.length;
      section.items.every((item, itemIndex) => {
        if (initItemCount < 0) return false;
        initItemCount--;
        const ref = useAnimatedRef();
        const offset = useSharedValue(trashOffset);
        const measureDirection = useSharedValue(false);
        const style = useAnimatedStyle(() => ({
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          borderColor: "red",
          borderTopWidth: 1,
          transform: [{ translateY: offset.value }],
        }));
        elements.push(
          <Item
            ref={ref}
            key={`${sectionIndex},${itemIndex}`}
            style={style}
            renderItem={props.renderItem}
            sectionIndex={sectionIndex}
            itemIndex={itemIndex}
            sections={props.sections}
            measureDirection={"bottom"}
            onLayout={(direction) => {
              measureDirection.value = direction;
              // console.log("onLayout", sectionIndex, itemIndex, direction);
            }}
          />,
        );
        const itemInfo = {
          ref,
          measureDirection,
          elementId: elementId++,
          sectionIndex,
          itemIndex,
          height: item.estimatedItemHeight,
          offset: trashOffset,
          reuseType: item.reuseType,
          animatedOffset: offset,
        };
        refs.push(ref);
        trashItems.push(itemInfo);
        return true;
      });
    });
  }

  const updateItem = (elementId, sectionIndex, itemIndex, direction) => {
    // console.log("更新", sectionIndex, itemIndex,refs[elementId]?.current);
    // refs[elementId]?.current?.updateIndex(sectionIndex, itemIndex, direction);
  };
  //#endregion onConten Change
  useAnimatedReaction(
    () => {
      return {
        y: props.contentOffset.y.value,
        height: props.size.height.value,
        measureables: trashItems.filter((item) => item.measureDirection.value),
      };
    },
    (res, pre) => {
      const summary = { ...heightSummary.value };
      const getItemHeight = (section: number, item: number) => {
        const ht = summary[`${section},${item}`];
        return ht ?? props.sections[section].items[item].estimatedItemHeight;
      };
      const setItemHeight = (section: number, item: number, value: number) => {
        const ht = summary[`${section},${item}`];
        if (ht === undefined) {
          sumGotHeight.value += value;
          if (gotItemHeightCount.value < itemCount) gotItemHeightCount.value++;
        } else {
          const increment = value - ht;
          sumGotHeight.value += increment;
        }
        summary[`${section},${item}`] = value;
        heightSummary.value = summary;
      };
      //比较Item
      const isTrashBetter = (item, trash, nextItemData) => {
        if (!item) return true;
        if (
          trash.sectionIndex === nextItemData.sectionIndex &&
          trash.itemIndex === nextItemData.itemIndex
        )
          return true;
        if (nextItemData.reuseType && item.reuseType !== nextItemData.reuseType) {
          if (trash.reuseType === nextItemData.reuseType) return true;
          if (
            Math.abs(trash.height - nextItemData.estimatedItemHeight) <
            Math.abs(item.height - nextItemData.estimatedItemHeight)
          )
            return true;
        }
        if (
          Math.abs(trash.height - nextItemData.estimatedItemHeight) <
          Math.abs(item.height - nextItemData.estimatedItemHeight)
        )
          return true;
        return false;
      };
      //需要测量items
      // console.log("需要测量items", res.measureables.length);
      if (res.measureables.length > 0) {
        let minMeasuredIndex = availableItems.length;
        res.measureables.forEach((itemShouldMeasure) => {
          const indexInAV = availableItems.findIndex(
            (fItem) => fItem.elementId === itemShouldMeasure.elementId,
          );
          if (indexInAV < 0) return;
          const item = availableItems[indexInAV];
          const layout = measure(itemShouldMeasure.ref);
          setItemHeight(item.sectionIndex, item.itemIndex, layout.height);
          const newItem = { ...item, height: layout.height };
          if (item.measureDirection.value === "top") {
            const ins = layout.height - item.height;
            newItem.offset -= ins;
            newItem.animatedOffset.value = newItem.offset;
          }
          availableItems.splice(indexInAV, 1, newItem);
          if (item.measureDirection.value === "bottom") {
            for (let i = indexInAV; i < availableItems.length - 1; i++) {
              const item = availableItems[i];
              const nextItem = { ...availableItems[i + 1] };
              nextItem.offset = item.offset + item.height;
              nextItem.animatedOffset.value = nextItem.offset;
              availableItems.splice(i + 1, 1, nextItem);
            }
          } else {
            // console.log(
            //   "top use 测量",
            //   item.sectionIndex,
            //   item.itemIndex,
            //   item.height,
            //   item.measureDirection.value,
            // );
            for (let i = indexInAV; i > 1; i--) {
              const item = availableItems[i];
              const preItem = { ...availableItems[i - 1] };
              preItem.offset = item.offset - preItem.height;
              preItem.animatedOffset.value = preItem.offset;
              availableItems.splice(i - 1, 1, preItem);
            }
          }
          item.measureDirection.value = false;
        });
      }

      if (res && res.height > 0 && (res.y !== pre?.y || res.height !== pre?.height)) {
        //开始置换
        const scrollY = res.y - (pre?.y ?? 0);
        //下滑
        if (scrollY >= 0) {
          //先回收顶部超出的Item
          while (
            availableItems[0]?.offset + availableItems[0]?.height <
            res.y - (screenHeight * extraRenderRate) / 2
          ) {
            availableItems[0].animatedOffset.value = trashOffset;
            trashItems.push(availableItems[0]);
            availableItems.splice(0, 1);
          }
          //处理底部新的Item进入
          let bottomItem = availableItems[availableItems.length - 1];
          while (
            !bottomItem ||
            bottomItem?.offset + bottomItem?.height <=
              res.y + res.height + (screenHeight * extraRenderRate) / 2
          ) {
            //获取即将渲染的Item下标
            const nextPath = { sectionIndex: 0, itemIndex: 0 };
            if (bottomItem) {
              if (bottomItem.itemIndex < props.sections[bottomItem.sectionIndex].items.length - 1) {
                nextPath.sectionIndex = bottomItem.sectionIndex;
                nextPath.itemIndex = bottomItem.itemIndex + 1;
              } else {
                if (bottomItem.sectionIndex === props.sections.length - 1) {
                  return;
                }
                nextPath.sectionIndex = bottomItem.sectionIndex + 1;
                nextPath.itemIndex = 0;
              }
            }

            //从垃圾桶选取一个最合适的Item
            // console.log("nextItemData", nextPath.sectionIndex, nextPath.itemIndex);
            const nextItemData = props.sections[nextPath.sectionIndex].items[nextPath.itemIndex];
            let recyleItem;
            trashItems.forEach((trashItem) => {
              if (isTrashBetter(recyleItem, trashItem, nextItemData)) recyleItem = trashItem;
            });
            if (!recyleItem) {
              return console.log(
                "Cannot find a trash item to bottom in reuse pool!",
                trashItems.length,
              );
            }
            trashItems.splice(trashItems.indexOf(recyleItem), 1);
            const nextItem = {
              ...recyleItem,
              sectionIndex: nextPath.sectionIndex,
              itemIndex: nextPath.itemIndex,
              offset: bottomItem ? bottomItem.offset + bottomItem.height : 0,
              reuseType: nextItemData.reuseType,
            };
            nextItem.animatedOffset.value = nextItem.offset;
            availableItems.push(nextItem);
            // console.log(
            //   "bottom reuse",
            //   recyleItem.sectionIndex,
            //   recyleItem.itemIndex,
            //   nextItem.sectionIndex,
            //   nextItem.itemIndex,
            //   nextItem.offset,
            // );
            setItemHeight(nextItem.sectionIndex, nextItem.itemIndex, nextItem.height);
            bottomItem = availableItems[availableItems.length - 1];
            runOnJS(updateItem)(
              nextItem.elementId,
              nextPath.sectionIndex,
              nextPath.itemIndex,
              "bottom",
            );
          }
        }
        //上滑
        if (scrollY < 0) {
          //先回收底部超出的Item
          let last = availableItems[availableItems.length - 1];
          while (
            last &&
            last.offset + last.height > res.y + res.height + (screenHeight * extraRenderRate) / 2
          ) {
            last.animatedOffset.value = trashOffset;
            trashItems.push(last);
            // console.log("上滑回收", last.sectionIndex, last.itemIndex, trashItems.length);
            availableItems.splice(availableItems.length - 1, 1);
            last = availableItems[availableItems.length - 1];
          }
          //处理顶部的item进入
          let topItem = availableItems[0];
          while (
            topItem?.offset + topItem?.height >=
            res.y - (screenHeight * extraRenderRate) / 2
          ) {
            const prePath = { ...topItem };
            //获取即将渲染的Item
            if (prePath.itemIndex > 0) {
              prePath.itemIndex--;
            } else {
              if (prePath.sectionIndex === 0) return;
              prePath.sectionIndex--;
              prePath.itemIndex = props.sections[prePath.sectionIndex].items.length - 1;
            }
            //从垃圾桶选取一个最合适的Item
            const preItemData = props.sections[prePath.sectionIndex].items[prePath.itemIndex];
            let recyleItem;
            trashItems.forEach((trashItem) => {
              if (isTrashBetter(recyleItem, trashItem, preItemData)) recyleItem = trashItem;
            });
            if (!recyleItem) {
              return console.log(
                "Cannot find a trash item to top in reuse pool!",
                trashItems.length,
              );
            }
            // console.log(
            //   "top reuse",
            //   recyleItem.sectionIndex,
            //   recyleItem.itemIndex,
            //   prePath.sectionIndex,
            //   prePath.itemIndex,
            // );
            trashItems.splice(trashItems.indexOf(recyleItem), 1);
            const preItem = {
              ...recyleItem,
              sectionIndex: prePath.sectionIndex,
              itemIndex: prePath.itemIndex,
              offset: topItem.offset - getItemHeight(prePath.sectionIndex, prePath.itemIndex),
              height: getItemHeight(prePath.sectionIndex, prePath.itemIndex),
              reuseType: preItemData.reuseType,
            };
            preItem.animatedOffset.value = preItem.offset;
            preItem.measureDirection.value = false;
            setItemHeight(preItem.sectionIndex, preItem.itemIndex, preItem.height);
            availableItems.splice(0, 0, preItem);
            runOnJS(updateItem)(preItem.elementId, preItem.sectionIndex, preItem.itemIndex, "top");
            topItem = availableItems[0];
          }
        }
      }
    },
  );

  const heightStyle = useAnimatedStyle(() => {
    if (!gotItemHeightCount.value) return {};
    return { height: (sumGotHeight.value / gotItemHeightCount.value) * itemCount };
  });
  const t = useSharedValue(100);
  return (
    <SpringScrollView contentContainerStyle={heightStyle} {...props}>
      {elements}
      <TouchableOpacity
        onPress={() => {
          t.value = withDecay({ velocity: 10 });
        }}
      >
        <Text>123123</Text>
      </TouchableOpacity>
    </SpringScrollView>
  );
};
