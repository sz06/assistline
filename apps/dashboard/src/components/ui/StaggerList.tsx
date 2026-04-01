import { motion } from "framer-motion";
import * as React from "react";

interface StaggerListProps {
  children: React.ReactNode;
  className?: string;
  staggerChildren?: number;
  delayChildren?: number;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};

export const itemVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24, mass: 0.5 },
  },
};

export function StaggerList({
  children,
  className,
  staggerChildren,
  delayChildren,
}: StaggerListProps) {
  const customVariants = {
    ...containerVariants,
    show: {
      ...containerVariants.show,
      transition: {
        staggerChildren:
          staggerChildren ?? containerVariants.show.transition.staggerChildren,
        delayChildren:
          delayChildren ?? containerVariants.show.transition.delayChildren,
      },
    },
  };

  return (
    <motion.div
      variants={customVariants}
      initial="hidden"
      animate="show"
      className={className}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return <motion.div variants={itemVariants}>{child}</motion.div>;
        }
        return child;
      })}
    </motion.div>
  );
}
